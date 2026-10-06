import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// POST /api/risk/check allows 8 fresh decodes an hour per IP. Only a request that
// actually enqueues a decode spends one: a cached report, a decode already queued
// and a 4xx rejection are free. Redis is an in-memory fake that keeps real sorted
// sets, so the limiter's counting is what's under test.
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
const db = vi.hoisted(() => ({ rows: (_params: unknown[]): unknown[] => [] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', async () => {
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  return {
    getDb: () => {
      let params: unknown[] = [];
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'from', 'orderBy']) q[m] = () => q;
      q.where = (cond: Parameters<typeof dialect.sqlToQuery>[0]) => {
        params = dialect.sqlToQuery(cond).params;
        return q;
      };
      q.limit = async () => db.rows(params);
      return q;
    },
  };
});

import { CLASSIFIER_VERSION } from '@chainward/decode';
import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const CACHED = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

const cachedRow = {
  id: '00000000-0000-0000-0000-000000000001',
  walletAddress: CACHED,
  chain: 'base',
  asOfBlock: 52_000_000,
  classifierVersion: CLASSIFIER_VERSION,
  band: 'low-signal',
  flagCount: 0,
  topFlags: [],
  agentName: null,
  survivalClass: null,
  viewCount: 3,
  reportData: {},
  riskAssessment: { band: 'low-signal', flags: [], not_assessed: [] },
  sources: null,
  reportMarkdown: null,
  isPublic: true,
  generatedAt: new Date(),
  attestationUid: null,
  attestationTx: null,
  attestedAt: null,
};

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

/** A distinct address per call, so forced re-checks never coalesce. */
const addr = (i: number) => `0x${i.toString(16).padStart(40, '1')}`;

function check(a: Hono, body: unknown) {
  return a.request('/api/risk/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/risk/check decode budget (8 an hour per IP)', () => {
  beforeEach(() => {
    store.zsets.clear();
    store.strings.clear();
    riskCheck.add.mockClear();
    db.rows = (params) => (params.includes(CACHED) ? [cachedRow] : []);
    // Blockscout counters: every address has history.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ transactions_count: '5', token_transfers_count: '1' }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('refuses the 9th fresh decode in an hour', async () => {
    const a = app();
    for (let i = 1; i <= 8; i++) {
      expect((await check(a, { target: addr(i), force_recheck: true })).status).toBe(202);
    }
    const ninth = await check(a, { target: addr(9), force_recheck: true });
    expect(ninth.status).toBe(429);
    expect(riskCheck.add).toHaveBeenCalledTimes(8);
  });

  it('does not count answers served from a cached report', async () => {
    const a = app();
    for (let i = 0; i < 12; i++) {
      const res = await check(a, { target: CACHED });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: { status: string } }).data.status).toBe('ready');
    }
    for (let i = 1; i <= 8; i++) {
      expect((await check(a, { target: addr(i), force_recheck: true })).status).toBe(202);
    }
  });

  it('does not count rejected input', async () => {
    const a = app();
    for (let i = 0; i < 12; i++) {
      expect((await check(a, { target: 'not-an-address!' })).status).toBe(400);
    }
    for (let i = 1; i <= 8; i++) {
      expect((await check(a, { target: addr(i), force_recheck: true })).status).toBe(202);
    }
  });

  it('does not count a check that joins a decode already queued', async () => {
    const a = app();
    store.strings.set(`risk:pending:${addr(100)}`, 'risk-queued');
    for (let i = 0; i < 12; i++) {
      expect((await check(a, { target: addr(100) })).status).toBe(202);
    }
    expect(riskCheck.add).not.toHaveBeenCalled();
    for (let i = 1; i <= 8; i++) {
      expect((await check(a, { target: addr(i), force_recheck: true })).status).toBe(202);
    }
  });
});
