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
const checks = vi.hoisted(() => ({
  calls: 0,
  mode: 'ok' as 'ok' | 'fail' | 'hang',
  last: '',
  launchTime: '2026-02-02T15:21:13.000Z' as string | null,
  serial: false,
  labelsFor: false,
}));
const recorded = vi.hoisted(() => ({ checks: [] as unknown[] }));
vi.mock('../lib/labels.js', () => ({
  labelsFor: async () => [],
  recordSerialLauncher: vi.fn(async (check: unknown) => void recorded.checks.push(check)),
}));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('@chainward/decode', async (orig) => ({
  ...(await orig<typeof import('@chainward/decode')>()),
  checkToken: vi.fn(async (token: string, deps?: { labelsFor?: unknown }) => {
    checks.calls++;
    checks.last = token;
    checks.labelsFor = typeof deps?.labelsFor === 'function';
    if (checks.mode === 'fail') throw new Error('eth_getCode: Your app has exceeded its compute units per second capacity');
    if (checks.mode === 'hang') return new Promise(() => {});
    return {
      token: token.toLowerCase(),
      chain: 'base',
      verdict: { label: 'review', reason: 'The wallet that launched it was first seen less than a day before the launch.' },
      launch: { time: checks.launchTime },
      flags: checks.serial ? ['creator_serial_launcher'] : ['new_creator'],
    };
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
  checks.launchTime = '2026-02-02T15:21:13.000Z';
  checks.serial = false;
  checks.labelsFor = false;
  recorded.checks = [];
  redis.set.mockClear();
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

  // The 402 body and the browser page offer free options; none of the wallet tools checks a token.
  it("offers no unrelated free alternatives in its 402, and points to the rug check's docs", async () => {
    const res = await paid.request(`/api/risk/rugcheck?token=${TOKEN}`, { headers: { Accept: 'application/json' } });
    const body = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(/attestation/);
    expect(body.docs).toBe('https://chainward.ai/docs');
    const html = await (await paid.request(`/api/risk/rugcheck?token=${TOKEN}`, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' } })).text();
    expect(html).toContain('ChainWard rug check');
    expect(html).not.toContain('wallet-api');
    expect(html).toContain('https://chainward.ai/docs');
  });

  it('is listed in /.well-known/x402 and /openapi.json under both names', () => {
    const resources = x402DiscoveryDocument().resources;
    expect(resources).toContain('https://api.chainward.ai/api/risk/rugcheck');
    expect(resources).toContain('https://api.chainward.ai/api/risk/token');
    const paths = x402OpenApiDocument().paths as Record<string, { get: { 'x-payment-info': { price: { amount: string } }; description: string } }>;
    expect(paths['/api/risk/rugcheck']!.get['x-payment-info'].price.amount).toBe('0.02');
    expect(paths['/api/risk/token']!.get['x-payment-info'].price.amount).toBe('0.02');
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/not a honeypot/i);
    // What a buyer pays for when the address is not a token, and the Virtuals case.
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/not_a_token[^.]*charged/);
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/Virtuals/);
    // Serial launchers and service launches are part of what the check reads.
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/serial launcher \(5 or more tokens through Clanker in 24 hours\)/);
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/token_admin/);
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

  // A launch-hour signal can change within minutes of launch, so a young token is re-read sooner.
  it('keeps the answer for a token launched within the last two hours for one minute only', async () => {
    checks.launchTime = new Date(Date.now() - 10 * 60_000).toISOString();
    await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(redis.set).toHaveBeenCalledWith(`token-check:v3:base:${TOKEN}`, expect.any(String), 'EX', 60);
  });

  it('keeps an older token for ten minutes', async () => {
    await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(redis.set).toHaveBeenCalledWith(`token-check:v3:base:${TOKEN}`, expect.any(String), 'EX', 600);
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

// The label set: the check reads the launch wallet's labels, and labels a serial launcher.
describe('labels and the token check', () => {
  // Tokens of their own: an earlier test leaves a check of TOKEN running forever.
  const T1 = `0x${'1'.repeat(40)}`;
  const T2 = `0x${'2'.repeat(40)}`;

  it('passes the label lookup to the check', async () => {
    await open.request(`/api/risk/rugcheck?token=${T1}`);
    expect(checks.labelsFor).toBe(true);
  });

  it('records a serial launcher from a fresh check, and nothing for others', async () => {
    checks.serial = true;
    await open.request(`/api/risk/rugcheck?token=${T2}`);
    await new Promise((r) => setTimeout(r, 0));
    expect(recorded.checks).toHaveLength(1);
    expect(recorded.checks[0]).toMatchObject({ flags: ['creator_serial_launcher'] });
  });
});

// A run that never settles must not hold every later check of that token hostage.
describe('a run that never finishes', () => {
  it('is joined while young, and replaced once it is older than a minute', async () => {
    const T3 = `0x${'3'.repeat(40)}`;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    checks.mode = 'hang';
    const first = open.request(`/api/risk/rugcheck?token=${T3}`);
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await first).status).toBe(504);
    const joined = open.request(`/api/risk/rugcheck?token=${T3}`);
    await vi.advanceTimersByTimeAsync(15_001);
    await joined;
    expect(checks.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    checks.mode = 'ok';
    const fresh = open.request(`/api/risk/rugcheck?token=${T3}`);
    await vi.advanceTimersByTimeAsync(10);
    expect((await fresh).status).toBe(200);
    expect(checks.calls).toBe(2);
  });
});
