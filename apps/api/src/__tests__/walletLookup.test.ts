import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiddlewareHandler } from 'hono';

// GET /v1/wallet/:address: the fast lookup behind an ag_ key, 1,000 free lookups a
// month per account. GET /api/risk/wallet: the same lookup over x402 for agents.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  const counts = new Map<string, number>();
  const bump = (k: string, by: number) => {
    const n = (counts.get(k) ?? 0) + by;
    counts.set(k, n);
    return n;
  };
  return {
    store,
    counts,
    /** What every rate-limit window already holds (the zcard answer). */
    windowCount: 0,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async (k: string) => bump(k, 1)),
    decr: vi.fn(async (k: string) => bump(k, -1)),
    expire: vi.fn(async () => 1),
    pipeline: vi.fn(() => {
      const p = {
        zremrangebyscore: () => p,
        zcard: () => p,
        zadd: () => p,
        expire: () => p,
        exec: async () => [
          [null, 0],
          [null, redis.windowCount],
          [null, 1],
          [null, 1],
        ],
      };
      return p;
    }),
  };
});
const lookups = vi.hoisted(() => ({ labelsFor: false as boolean, calls: 0, mode: 'ok' as 'ok' | 'fail' | 'hang' }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../middleware/apiKeyAuth.js', () => ({
  requireApiKeyOrSession: (): MiddlewareHandler => async (c, next) => {
    if (c.req.header('Authorization') !== 'Bearer ag_test') {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    c.set('user' as never, { id: 'user-1' } as never);
    await next();
  },
}));
vi.mock('@chainward/decode', async (orig) => ({
  ...(await orig<typeof import('@chainward/decode')>()),
  lookupWallet: vi.fn(async (address: string, chain: string, deps?: { labelsFor?: unknown }) => {
    lookups.calls++;
    lookups.labelsFor = typeof deps?.labelsFor === 'function';
    if (lookups.mode === 'fail') throw new Error('eth_getCode: Your app has exceeded its compute units per second capacity');
    if (lookups.mode === 'hang') return new Promise(() => {});
    return { address: address.toLowerCase(), chain, verdict: { label: 'no_flags', reason: 'None of the checks matched.' }, flags: [] };
  }),
}));

import { createApp } from '../app.js';
import { x402CheckMiddleware, x402DiscoveryDocument, x402OpenApiDocument } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const KEY = { Authorization: 'Bearer ag_test' };
const month = () => new Date().toISOString().slice(0, 7);
const quotaUsed = () => redis.counts.get(`wallet-lookup:quota:user-1:${month()}`) ?? 0;

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

let app: ReturnType<typeof createApp>;
beforeAll(() => {
  vi.stubEnv('X402_PAY_TO', '0x000000000000000000000000000000000000dEaD');
  vi.stubEnv('BASE_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test');
  vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
  app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  redis.store.clear();
  redis.counts.clear();
  redis.windowCount = 0;
  lookups.calls = 0;
  lookups.mode = 'ok';
  vi.useRealTimers();
});

describe('GET /v1/wallet/:address', () => {
  it('needs an API key', async () => {
    const res = await app.request(`/v1/wallet/${ADDR}`);
    expect(res.status).toBe(401);
  });

  it.each([['0xzz'], ['0x0000000000000000000000000000000000000000']])('refuses %s with 400', async (addr) => {
    const res = await app.request(`/v1/wallet/${addr}`, { headers: KEY });
    expect(res.status).toBe(400);
  });

  it('refuses an unknown chain with 400', async () => {
    const res = await app.request(`/v1/wallet/${ADDR}?chain=eth`, { headers: KEY });
    expect(res.status).toBe(400);
  });

  it('answers the lookup with the quota left this month', async () => {
    const res = await app.request(`/v1/wallet/${ADDR}?chain=bsc`, { headers: KEY });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { address: string; chain: string; verdict: { label: string } } };
    expect(body.data).toMatchObject({ address: ADDR, chain: 'bsc', verdict: { label: 'no_flags' } });
    expect(res.headers.get('x-quota-limit')).toBe('1000');
    expect(res.headers.get('x-quota-remaining')).toBe('999');
    expect(quotaUsed()).toBe(1);
  });

  it('serves a repeat lookup from cache', async () => {
    await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(lookups.calls).toBe(1);
  });

  it('answers 429 with how to get more once the free month is used', async () => {
    redis.counts.set(`wallet-lookup:quota:user-1:${month()}`, 1000);
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('QUOTA_EXCEEDED');
    expect(body.error.message).toMatch(/hello@chainward\.ai/);
    expect(lookups.calls).toBe(0);
  });

  it('answers 503, counting nothing and naming no provider, when the chain source fails', async () => {
    lookups.mode = 'fail';
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SOURCES_UNAVAILABLE');
    expect(body.error.message).not.toMatch(/compute units|alchemy/i);
    expect(quotaUsed()).toBe(0);
  });

  it('answers 504, counting nothing, when the lookup runs past its time budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    lookups.mode = 'hang';
    const pending = app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    await vi.advanceTimersByTimeAsync(10_001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LOOKUP_TIMEOUT');
    expect(quotaUsed()).toBe(0);
  });

  it('rate limits by IP before it looks at the key', async () => {
    redis.windowCount = 10_000;
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: { Authorization: 'Bearer ag_random' } });
    expect(res.status).toBe(429);
  });

  it("stops free lookups that miss the cache once the day's cap is spent, pointing to x402", async () => {
    redis.counts.set(`wallet-lookup:free-misses:${new Date().toISOString().slice(0, 10)}`, 500);
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FREE_TIER_BUSY');
    expect(body.error.message).toMatch(/api\/risk\/wallet/);
    expect(lookups.calls).toBe(0);
    expect(quotaUsed()).toBe(0);
  });

  it("still serves a cached answer once the day's cap is spent", async () => {
    await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    redis.counts.set(`wallet-lookup:free-misses:${new Date().toISOString().slice(0, 10)}`, 500);
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/risk/wallet (x402)', () => {
  it('asks for payment with the lookup price', async () => {
    const res = await app.request(`/api/risk/wallet?address=${ADDR}`);
    expect(res.status).toBe(402);
    const challenge = JSON.parse(Buffer.from(res.headers.get('payment-required')!, 'base64').toString());
    expect(challenge.accepts[0].amount).toBe('10000');
    expect(challenge.resource.url).toBe('https://api.chainward.ai/api/risk/wallet');
  });

  it('refuses bad input before any payment', async () => {
    const res = await app.request('/api/risk/wallet?address=0xzz');
    expect(res.status).toBe(400);
    expect(res.headers.get('payment-required')).toBeNull();
  });

  it('is listed in /.well-known/x402 and /openapi.json', () => {
    expect(x402DiscoveryDocument().resources).toContain('https://api.chainward.ai/api/risk/wallet');
    expect((x402OpenApiDocument().paths as Record<string, unknown>)['/api/risk/wallet']).toBeDefined();
  });
});

// The label set: the lookup reads the wallet's public labels.
describe('labels in the wallet lookup route', () => {
  it('passes the label lookup to the wallet lookup', async () => {
    lookups.labelsFor = false;
    await app.request(`/v1/wallet/0x${'5'.repeat(40)}`, { headers: KEY });
    expect(lookups.labelsFor).toBe(true);
  });
});
