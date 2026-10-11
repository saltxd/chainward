import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The per-client decode budget (8 an hour) is per IP or IPv6 /64, so many clients
// together could still run unlimited free decodes. A global hourly cap
// (FREE_DECODES_PER_HOUR_GLOBAL, default 300) bounds the total. Set to 5 here.
vi.hoisted(() => {
  process.env.FREE_DECODES_PER_HOUR_GLOBAL = '5';
});

const store = vi.hoisted(() => ({
  zsets: new Map<string, Map<string, number>>(),
  strings: new Map<string, string>(),
}));

const redis = vi.hoisted(() => {
  const zset = (key: string) => {
    let s = store.zsets.get(key);
    if (!s) store.zsets.set(key, (s = new Map()));
    return s;
  };
  const ops = {
    zremrangebyscore: (key: string, min: number, max: number) => {
      const s = zset(key);
      let n = 0;
      for (const [m, score] of s) {
        if (score >= min && score <= max) {
          s.delete(m);
          n++;
        }
      }
      return n;
    },
    zcard: (key: string) => zset(key).size,
    zadd: (key: string, score: number, member: string) => (zset(key).set(member, score), 1),
    zrem: (key: string, member: string) => (zset(key).delete(member) ? 1 : 0),
    expire: () => 1,
  };
  return {
    ...Object.fromEntries(Object.entries(ops).map(([k, f]) => [k, async (...a: never[]) => (f as (...x: never[]) => unknown)(...a)])),
    get: async (key: string) => store.strings.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.strings.has(key)) return null;
      store.strings.set(key, value);
      return 'OK';
    },
    pipeline: () => {
      const queued: Array<() => unknown> = [];
      const p: Record<string, unknown> = {
        exec: async () => queued.map((q) => [null, q()]),
      };
      for (const [name, f] of Object.entries(ops)) {
        p[name] = (...a: never[]) => {
          queued.push(() => (f as (...x: never[]) => unknown)(...a));
          return p;
        };
      }
      return p;
    },
  };
});

const riskCheck = vi.hoisted(() => ({ add: vi.fn(async (_n: string, _d: unknown, o: { jobId: string }) => ({ id: o.jobId })) }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => ({
  getDb: () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'from', 'orderBy', 'where']) q[m] = () => q;
    q.limit = async () => [];
    return q;
  },
}));

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

const addr = (i: number) => `0x${i.toString(16).padStart(40, '1')}`;

function check(a: Hono, target: string, ip: string) {
  return a.request('/api/risk/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ target, force_recheck: true }),
  });
}

describe('POST /api/risk/check: global hourly cap on free decodes', () => {
  beforeEach(() => {
    store.zsets.clear();
    store.strings.clear();
    riskCheck.add.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ transactions_count: '5', token_transfers_count: '1' }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('refuses a decode from a fresh client once the hour holds the global cap', async () => {
    const a = app();
    for (let i = 1; i <= 5; i++) {
      expect((await check(a, addr(i), `198.51.100.${i}`)).status).toBe(202);
    }
    const sixth = await check(a, addr(6), '198.51.100.6');
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
    expect(riskCheck.add).toHaveBeenCalledTimes(5);
  });

  it("does not charge a client's own budget for a decode the global cap refused", async () => {
    const a = app();
    for (let i = 1; i <= 5; i++) expect((await check(a, addr(i), '198.51.100.1')).status).toBe(202);
    expect((await check(a, addr(6), '198.51.100.1')).status).toBe(429);
    expect(store.zsets.get('rl:risk-decode:ip:198.51.100.1')?.size).toBe(5);
    expect(riskCheck.add).toHaveBeenCalledTimes(5);
  });

  it('counts IPv6 clients toward the same cap', async () => {
    const a = app();
    for (let i = 1; i <= 5; i++) {
      expect((await check(a, addr(i), `2001:db8:${i}::1`)).status).toBe(202);
    }
    expect((await check(a, addr(6), '2001:db8:6::1')).status).toBe(429);
  });
});
