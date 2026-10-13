import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiddlewareHandler } from 'hono';

// GET /v1/wallet/:address: the fast lookup behind an ag_ key, 1,000 free lookups a
// month per account. GET /api/risk/wallet: the same lookup over x402 for agents.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    count: 0,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async function (this: { count: number }) {
      return ++redis.count;
    }),
    decr: vi.fn(async () => --redis.count),
    expire: vi.fn(async () => 1),
    pipeline: vi.fn(() => {
      const p = {
        zremrangebyscore: () => p,
        zcard: () => p,
        zadd: () => p,
        expire: () => p,
        exec: async () => [
          [null, 0],
          [null, 0],
          [null, 1],
          [null, 1],
        ],
      };
      return p;
    }),
  };
});
const lookups = vi.hoisted(() => ({ calls: 0 }));

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
  lookupWallet: vi.fn(async (address: string, chain: string) => {
    lookups.calls++;
    return { address: address.toLowerCase(), chain, verdict: { label: 'no_flags', reason: 'None of the checks matched.' }, flags: [] };
  }),
}));

import { createApp } from '../app.js';
import { x402CheckMiddleware, x402DiscoveryDocument, x402OpenApiDocument } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const KEY = { Authorization: 'Bearer ag_test' };

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
  redis.count = 0;
  lookups.calls = 0;
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
  });

  it('serves a repeat lookup from cache', async () => {
    await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(lookups.calls).toBe(1);
  });

  it('answers 429 with how to get more once the free month is used', async () => {
    redis.count = 1000;
    const res = await app.request(`/v1/wallet/${ADDR}`, { headers: KEY });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('QUOTA_EXCEEDED');
    expect(body.error.message).toMatch(/hello@chainward\.ai/);
    expect(lookups.calls).toBe(0);
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
