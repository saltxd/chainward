import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/risk/rugcheck?token= (and the alias GET /api/risk/token?address=): the
// token check over x402. Who launched a Base token, how, and what the launch
// wallet and the supply did afterwards. Bad input is refused before payment,
// failures are never charged, and answers are cached for ten minutes.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    windowCount: 0,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async () => 1),
    decr: vi.fn(async () => 0),
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
const checks = vi.hoisted(() => ({ calls: 0, mode: 'ok' as 'ok' | 'fail' | 'hang', last: '' }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('@chainward/decode', async (orig) => ({
  ...(await orig<typeof import('@chainward/decode')>()),
  checkToken: vi.fn(async (token: string) => {
    checks.calls++;
    checks.last = token;
    if (checks.mode === 'fail') throw new Error('eth_getCode: Your app has exceeded its compute units per second capacity');
    if (checks.mode === 'hang') return new Promise(() => {});
    return { token: token.toLowerCase(), chain: 'base', verdict: { label: 'review', reason: 'The wallet that launched it was first seen the same day as the launch.' }, flags: ['new_creator'] };
  }),
}));

import { createApp } from '../app.js';
import { x402CheckMiddleware, x402DiscoveryDocument, x402OpenApiDocument } from '../lib/x402.js';

const TOKEN = '0x5f13d8f3bd2a9bd439d6ec9734ac1b4fb32b3b07';

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

const challengeOf = (res: Response) => JSON.parse(Buffer.from(res.headers.get('payment-required')!, 'base64').toString());

let paid: ReturnType<typeof createApp>;
let open: ReturnType<typeof createApp>;
beforeAll(() => {
  vi.stubEnv('X402_PAY_TO', '0x000000000000000000000000000000000000dEaD');
  vi.stubEnv('BASE_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test');
  vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
  paid = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
  // The same routes with no payment middleware, to test the handler itself.
  open = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  redis.store.clear();
  redis.windowCount = 0;
  checks.calls = 0;
  checks.mode = 'ok';
  checks.last = '';
  vi.useRealTimers();
});

describe('GET /api/risk/rugcheck (x402)', () => {
  it('asks for payment at the token check price', async () => {
    const res = await paid.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(res.status).toBe(402);
    const challenge = challengeOf(res);
    expect(challenge.accepts[0].amount).toBe('20000');
    expect(challenge.resource.url).toBe('https://api.chainward.ai/api/risk/rugcheck');
  });

  it('answers the bare URL with the 402, so catalogs can read the price', async () => {
    const res = await paid.request('/api/risk/rugcheck');
    expect(res.status).toBe(402);
  });

  it.each([['0xzz'], ['0x0000000000000000000000000000000000000000']])('refuses token %s with 400 before any payment', async (t) => {
    const res = await paid.request(`/api/risk/rugcheck?token=${t}`);
    expect(res.status).toBe(400);
    expect(res.headers.get('payment-required')).toBeNull();
  });

  it('refuses another chain with 400 before any payment', async () => {
    const res = await paid.request(`/api/risk/rugcheck?token=${TOKEN}&chain=bsc`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_CHAIN');
    expect(res.headers.get('payment-required')).toBeNull();
  });

  it('serves the alias GET /api/risk/token?address= at the same price', async () => {
    const res = await paid.request(`/api/risk/token?address=${TOKEN}`);
    expect(res.status).toBe(402);
    const challenge = challengeOf(res);
    expect(challenge.accepts[0].amount).toBe('20000');
    expect(challenge.resource.url).toBe('https://api.chainward.ai/api/risk/token');
  });

  it('is listed in /.well-known/x402 and /openapi.json under both names', () => {
    const resources = x402DiscoveryDocument().resources;
    expect(resources).toContain('https://api.chainward.ai/api/risk/rugcheck');
    expect(resources).toContain('https://api.chainward.ai/api/risk/token');
    const paths = x402OpenApiDocument().paths as Record<string, { get: { 'x-payment-info': { price: { amount: string } }; description: string } }>;
    expect(paths['/api/risk/rugcheck']!.get['x-payment-info'].price.amount).toBe('0.02');
    expect(paths['/api/risk/token']!.get['x-payment-info'].price.amount).toBe('0.02');
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/not a honeypot/i);
  });
});

describe('the token check handler', () => {
  it('answers the check for the token, lowercased', async () => {
    const res = await open.request(`/api/risk/rugcheck?token=${TOKEN.toUpperCase().replace('0X', '0x')}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { token: string; verdict: { label: string } } };
    expect(body.data).toMatchObject({ token: TOKEN, verdict: { label: 'review' } });
    expect(checks.last).toBe(TOKEN);
  });

  it('takes ?address= as well as ?token=', async () => {
    const res = await open.request(`/api/risk/rugcheck?address=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('serves a repeat check from the cache', async () => {
    await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    await open.request(`/api/risk/token?address=${TOKEN}`);
    expect(checks.calls).toBe(1);
  });

  it('answers 503 naming no provider when the chain source fails', async () => {
    checks.mode = 'fail';
    const res = await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SOURCES_UNAVAILABLE');
    expect(body.error.message).not.toMatch(/compute units|alchemy/i);
    expect(body.error.message).toMatch(/not charged/i);
  });

  it('answers 504 when the check runs past its time budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    checks.mode = 'hang';
    const pending = open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    await vi.advanceTimersByTimeAsync(15_001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('CHECK_TIMEOUT');
  });
});
