import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/risk/token-report/:address: the rug check, free, for people who paste a
// token on chainward.ai. Each visitor gets an hourly allowance of fresh checks and
// everyone shares a daily one, so the free page cannot spend the chain reads the paid
// check needs. Only a fresh check of an actual token spends: a cached answer, and a
// wallet pasted into the same box, spend nothing.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const z = (k: string) => {
    if (!zsets.has(k)) zsets.set(k, new Map());
    return zsets.get(k)!;
  };
  return {
    store,
    zsets,
    z,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    zrem: vi.fn(async (k: string, m: string) => (z(k).delete(m) ? 1 : 0)),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    pipeline: vi.fn(() => {
      const ops: Array<() => unknown> = [];
      const p = {
        zremrangebyscore: (k: string, min: number, max: number) => {
          ops.push(() => {
            for (const [m, s] of z(k)) if (s >= min && s <= max) z(k).delete(m);
            return 0;
          });
          return p;
        },
        zcard: (k: string) => {
          ops.push(() => z(k).size);
          return p;
        },
        zadd: (k: string, s: number, m: string) => {
          ops.push(() => {
            z(k).set(m, s);
            return 1;
          });
          return p;
        },
        expire: () => {
          ops.push(() => 1);
          return p;
        },
        exec: async () => ops.map((op) => [null, op()]),
      };
      return p;
    }),
  };
});
const checks = vi.hoisted(() => ({
  calls: 0,
  kind: 'token' as 'token' | 'wallet',
  fail: false,
  young: false,
  gate: null as Promise<void> | null,
}));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('@chainward/decode', async (orig) => ({
  ...(await orig<typeof import('@chainward/decode')>()),
  checkToken: vi.fn(async (token: string, _deps: unknown, opts?: { beforeLaunchSearch?: () => Promise<void> }) => {
    checks.calls++;
    if (checks.gate) await checks.gate;
    if (checks.kind === 'wallet') {
      return {
        token,
        chain: 'base',
        verdict: { label: 'review', reason: 'There is no contract at this address on Base, so it is not a token.' },
        launch: null,
        flags: ['not_a_contract'],
      };
    }
    await opts?.beforeLaunchSearch?.();
    if (checks.fail) throw new Error('eth_getLogs: Your app has exceeded its compute units per second capacity');
    return {
      token,
      chain: 'base',
      verdict: { label: 'review', reason: 'The wallet that launched it was first seen less than a day before the launch.' },
      launch: { time: checks.young ? new Date(Date.now() - 10 * 60_000).toISOString() : '2026-02-02T15:21:13.000Z' },
      flags: ['new_creator'],
    };
  }),
}));

import { createApp } from '../app.js';
import { FREE_PROBES_PER_DAY, FREE_TOKEN_CHECKS_PER_DAY, FREE_TOKEN_CHECKS_PER_HOUR } from '../routes/tokenCheck.js';
import { x402CheckMiddleware, x402DiscoveryDocument, x402OpenApiDocument } from '../lib/x402.js';

const TOKEN = '0x5f13d8f3bd2a9bd439d6ec9734ac1b4fb32b3b07';
const IP = '203.0.113.7';
const HOURLY = `bud:token-report:ip:${IP}`;
const DAILY = 'bud:token-report-day:global';
const PROBES = 'bud:token-probe-day:global';
const SHARED = `token-check:v2:base:${TOKEN}`;
const RECENT = `token-report:recent:${TOKEN}`;

function facilitatorFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  if (href.endsWith('/supported')) {
    return Promise.resolve(
      new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: [], signers: {} }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${href}`));
}

const fill = (key: string, n: number) => {
  for (let i = 0; i < n; i++) redis.z(key).set(`seed:${i}`, Date.now());
};

let app: ReturnType<typeof createApp>;
const get = (address: string) => app.request(`/api/risk/token-report/${address}`, { headers: { 'cf-connecting-ip': IP } });

beforeAll(() => {
  vi.stubEnv('X402_PAY_TO', '0x000000000000000000000000000000000000dEaD');
  vi.stubEnv('BASE_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test');
  vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
  // The server that charges for the rug check: the free route must not ask for payment.
  app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  redis.set.mockClear();
  checks.calls = 0;
  checks.kind = 'token';
  checks.fail = false;
  checks.young = false;
  checks.gate = null;
});

describe('GET /api/risk/token-report/:address (free, for chainward.ai)', () => {
  it('answers the rug check without asking for payment', async () => {
    const res = await get(TOKEN.toUpperCase().replace('0X', '0x'));
    expect(res.status).toBe(200);
    expect(res.headers.get('payment-required')).toBeNull();
    const body = (await res.json()) as { data: { token: string; verdict: { label: string } } };
    expect(body.data).toMatchObject({ token: TOKEN, verdict: { label: 'review' } });
  });

  it.each([['0xzz'], ['0x0000000000000000000000000000000000000000']])('refuses %s with 400', async (address) => {
    const res = await get(address);
    expect(res.status).toBe(400);
  });

  it('spends one free check, from the visitor and from the day, for a fresh token check', async () => {
    await get(TOKEN);
    expect(redis.z(HOURLY).size).toBe(1);
    expect(redis.z(DAILY).size).toBe(1);
  });

  it('spends nothing for an answer already in the cache, and shares the cache with the paid check', async () => {
    await get(TOKEN);
    await get(TOKEN);
    const open = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
    await open.request(`/api/risk/rugcheck?address=${TOKEN}`);
    expect(checks.calls).toBe(1);
    expect(redis.z(HOURLY).size).toBe(1);
    expect(redis.z(DAILY).size).toBe(1);
  });

  it('spends nothing for a wallet pasted into the same box', async () => {
    checks.kind = 'wallet';
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { flags: string[] } }).data.flags).toEqual(['not_a_contract']);
    expect(redis.z(HOURLY).size).toBe(0);
    expect(redis.z(DAILY).size).toBe(0);
  });

  it("answers 429 FREE_CHECKS_USED_UP, naming the paid check, when today's free checks are used up", async () => {
    fill(DAILY, FREE_TOKEN_CHECKS_PER_DAY);
    const res = await get(TOKEN);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FREE_CHECKS_USED_UP');
    expect(body.error.message).toContain('https://api.chainward.ai/api/risk/rugcheck');
    expect(body.error.message).toContain('$0.02');
    // The visitor's own allowance is given back.
    expect(redis.z(HOURLY).size).toBe(0);
  });

  it('still answers a wallet when the free token checks are used up', async () => {
    fill(DAILY, FREE_TOKEN_CHECKS_PER_DAY);
    checks.kind = 'wallet';
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
  });

  // Its own code, so the page can tell it from the per-minute limit (which falls back to the wallet report).
  it("answers 429 FREE_HOURLY_LIMIT when one visitor has used this hour's free checks", async () => {
    fill(HOURLY, FREE_TOKEN_CHECKS_PER_HOUR);
    const res = await get(TOKEN);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FREE_HOURLY_LIMIT');
    expect(body.error.message).toContain('https://api.chainward.ai/api/risk/rugcheck');
    expect(redis.z(DAILY).size).toBe(0);
  });

  // A token in its first two hours is re-read every minute for the paid check; the free page
  // must not pay for each of those reads.
  it('spends the free allowance once per token in ten minutes, however often it is re-read', async () => {
    checks.young = true;
    await get(TOKEN);
    redis.store.delete(SHARED);
    redis.store.delete(RECENT);
    await get(TOKEN);
    expect(checks.calls).toBe(2);
    expect(redis.z(HOURLY).size).toBe(1);
    expect(redis.z(DAILY).size).toBe(1);
  });

  it("keeps a young token's free answer for three minutes", async () => {
    checks.young = true;
    await get(TOKEN);
    expect(redis.set).toHaveBeenCalledWith(SHARED, expect.any(String), 'EX', 60);
    expect(redis.set).toHaveBeenCalledWith(RECENT, expect.any(String), 'EX', 180);
    redis.store.delete(SHARED);
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(checks.calls).toBe(1);
  });

  it('runs one check for requests that arrive while it is running', async () => {
    let release!: () => void;
    checks.gate = new Promise<void>((r) => (release = r));
    const both = Promise.all([get(TOKEN), get(TOKEN)]);
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [a, b] = await both;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(checks.calls).toBe(1);
    expect(redis.z(DAILY).size).toBe(1);
  });

  it('gives the free check back when the chain source fails', async () => {
    checks.fail = true;
    const res = await get(TOKEN);
    expect(res.status).toBe(503);
    expect(redis.z(HOURLY).size).toBe(0);
    expect(redis.z(DAILY).size).toBe(0);
    checks.fail = false;
    await get(TOKEN);
    expect(redis.z(DAILY).size).toBe(1);
  });

  // Each uncached address costs a few chain reads before the check knows it is a token, so
  // everyone shares a daily cap on them; the page then shows the wallet report instead.
  it('caps the uncached addresses it reads each day, for everyone', async () => {
    checks.kind = 'wallet';
    await get(TOKEN);
    expect(redis.z(PROBES).size).toBe(1);
    redis.store.clear();
    fill(PROBES, FREE_PROBES_PER_DAY);
    const res = await get(TOKEN);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('PROBES_USED_UP');
    expect(checks.calls).toBe(1);
  });

  it('answers from the cache only when asked, reading nothing and spending nothing', async () => {
    const miss = await app.request(`/api/risk/token-report/${TOKEN}?cached=1`, { headers: { 'cf-connecting-ip': IP } });
    expect(miss.status).toBe(404);
    expect(checks.calls).toBe(0);
    expect(redis.z(PROBES).size).toBe(0);
    await get(TOKEN);
    const hit = await app.request(`/api/risk/token-report/${TOKEN}?cached=1`, { headers: { 'cf-connecting-ip': IP } });
    expect(hit.status).toBe(200);
    expect(checks.calls).toBe(1);
  });

  // A free run refused by today's allowance must not fail a buyer who paid for the same token.
  it('never shares a running check with the paid route', async () => {
    fill(DAILY, FREE_TOKEN_CHECKS_PER_DAY);
    let release!: () => void;
    checks.gate = new Promise<void>((r) => (release = r));
    const open = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
    const free = get(TOKEN);
    const paid = open.request(`/api/risk/rugcheck?address=${TOKEN}`);
    await new Promise((r) => setTimeout(r, 10));
    release();
    expect((await free).status).toBe(429);
    expect((await paid).status).toBe(200);
  });

  it('is not listed as a paid route', () => {
    expect(x402DiscoveryDocument().resources.some((r: string) => r.includes('token-report'))).toBe(false);
    expect(Object.keys(x402OpenApiDocument().paths as Record<string, unknown>).some((p) => p.includes('token-report'))).toBe(false);
  });
});
