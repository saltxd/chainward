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
    // An allowance whose key starts with this is spent out (other limits see windowCount).
    spentOut: '',
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async () => 1),
    decr: vi.fn(async () => 0),
    zrem: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    pipeline: vi.fn(() => {
      let key = '';
      const p = {
        zremrangebyscore: (k: string) => {
          key = k;
          return p;
        },
        zcard: () => p,
        zadd: () => p,
        expire: () => p,
        exec: async () => [
          [null, 0],
          [null, redis.spentOut && key.startsWith(redis.spentOut) ? 10_000 : redis.windowCount],
          [null, 1],
          [null, 1],
        ],
      };
      return p;
    }),
  };
});
// The chain reads the paid route makes before its 402: eth_getCode and totalSupply(), and
// symbol() and name() for a contract that is not an ERC-20.
const chain = vi.hoisted(() => {
  const SEL = { totalSupply: '0x18160ddd', symbol: '0x95d89b41', name: '0x06fdde03' };
  const abiString = (s: string) =>
    `0x${'20'.padStart(64, '0')}${s.length.toString(16).padStart(64, '0')}${Buffer.from(s).toString('hex').padEnd(64, '0')}`;
  const state = {
    code: '0x6080604052',
    supply: true,
    symbol: null as string | null,
    fail: false,
    reads: [] as string[],
    async rpc(method: string, params: unknown[]): Promise<unknown> {
      if (state.fail) throw new Error(`${method}: Your app has exceeded its compute units per second capacity`);
      if (method === 'eth_getCode') {
        state.reads.push('code');
        return state.code;
      }
      const data = method === 'eth_call' ? (params[0] as { data: string }).data : '';
      const read = Object.entries(SEL).find(([, sel]) => sel === data)?.[0];
      if (!read) throw new Error(`unexpected read in test: ${method} ${data}`);
      state.reads.push(read);
      if (state.code === '0x') return '0x';
      if (read === 'totalSupply' && state.supply) return `0x${(10n ** 27n).toString(16).padStart(64, '0')}`;
      if (read !== 'totalSupply' && state.symbol) return abiString(state.symbol);
      throw new Error('eth_call: execution reverted');
    },
  };
  return state;
});
const checks = vi.hoisted(() => ({
  result: null as Record<string, unknown> | null,
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
  alchemyTokenCheckDeps: () => ({ rpc: chain.rpc }),
  checkToken: vi.fn(async (token: string, deps?: { labelsFor?: unknown }) => {
    checks.calls++;
    checks.last = token;
    checks.labelsFor = typeof deps?.labelsFor === 'function';
    if (checks.mode === 'fail') throw new Error('eth_getCode: Your app has exceeded its compute units per second capacity');
    if (checks.mode === 'hang') return new Promise(() => {});
    if (checks.result) return { token: token.toLowerCase(), chain: 'base', launch: null, ...checks.result };
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
// From the QA run's bad inputs: an EOA on Base, and the Uniswap v2 factory (a contract, not a token).
const EOA = '0x1afab1f6b0d565544effb26fca7d6b5e9cb46c81';
const FACTORY = '0x8909dc15e40173ff4699343b6eb8132c65e18ec6';
const SHARED = (t: string) => `token-check:v7:base:${t}`;
const KIND = (t: string) => `token-kind:v1:base:${t}`;
type ErrorBody = { error: { code: string; message: string; details?: { flag?: string } } };

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
  redis.spentOut = '';
  checks.result = null;
  checks.calls = 0;
  checks.mode = 'ok';
  chain.code = '0x6080604052';
  chain.supply = true;
  chain.symbol = null;
  chain.fail = false;
  chain.reads = [];
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
    // A buyer pays nothing for an address that is not a token, and can tell a cached answer from a fresh one.
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/400 NOT_A_TOKEN[^.]*never charged/);
    expect(paths['/api/risk/rugcheck']!.get.description).not.toMatch(/that answer is charged/);
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/checked_at, cached and age_seconds/);
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/Virtuals/);
    // Serial launchers and service launches are part of what the check reads.
    expect(paths['/api/risk/rugcheck']!.get.description).toMatch(/serial launcher \(5 or more launches through Clanker, Doppler or Zora in 24 hours\)/);
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
    expect(redis.set).toHaveBeenCalledWith(SHARED(TOKEN), expect.any(String), 'EX', 60);
  });

  it('keeps an older token for ten minutes', async () => {
    await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(redis.set).toHaveBeenCalledWith(SHARED(TOKEN), expect.any(String), 'EX', 600);
  });

  it('answers 503 naming no provider when the chain source fails', async () => {
    checks.mode = 'fail';
    const res = await open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SOURCES_UNAVAILABLE');
    expect(body.error.message).not.toMatch(/compute units|alchemy/i);
    expect(body.error.message).toMatch(/not charged/i);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('answers 504 when the check runs past its time budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    checks.mode = 'hang';
    const pending = open.request(`/api/risk/rugcheck?token=${TOKEN}`);
    await vi.advanceTimersByTimeAsync(15_001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('CHECK_TIMEOUT');
    // The run goes on and fills the cache; a minute later the finished answer is there.
    expect(res.headers.get('retry-after')).toBe('60');
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

// Defect 8 of the QA run: an EOA, an address with no code on Base and a contract that is not an
// ERC-20 got the 402, and once paid a "review" saying it is not a token. They are refused before
// the 402 now, from one eth_getCode and one totalSupply() read, kept in Redis.
describe('GET /api/risk/rugcheck: an address that is not a token, before any payment', () => {
  it('refuses an address with no contract on Base with 400 NOT_A_TOKEN, under both names', async () => {
    chain.code = '0x';
    for (const path of [`/api/risk/rugcheck?address=${EOA}`, `/api/risk/token?address=${EOA}`]) {
      const res = await paid.request(path);
      expect(res.status).toBe(400);
      expect(res.headers.get('payment-required')).toBeNull();
      const body = (await res.json()) as ErrorBody;
      expect(body.error).toMatchObject({ code: 'NOT_A_TOKEN', details: { flag: 'not_a_contract' } });
      expect(body.error.message).toMatch(/no contract at this address on Base/);
    }
    expect(checks.calls).toBe(0);
  });

  it('refuses a contract that does not answer totalSupply() with 400 NOT_A_TOKEN', async () => {
    chain.supply = false;
    const res = await paid.request(`/api/risk/rugcheck?address=${FACTORY}`);
    expect(res.status).toBe(400);
    expect(res.headers.get('payment-required')).toBeNull();
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toMatchObject({ code: 'NOT_A_TOKEN', details: { flag: 'not_a_token' } });
    expect(body.error.message).toMatch(/not an ERC-20 token/);
  });

  // A fake USDC that only emits Transfer events is not a full ERC-20, but its answer is a Hold worth paying for.
  it('still asks for payment for a contract whose symbol passes for a well-known token', async () => {
    chain.supply = false;
    chain.symbol = 'USDC';
    expect((await paid.request(`/api/risk/rugcheck?address=${FACTORY}`)).status).toBe(402);
  });

  it('asks for payment for a token after one eth_getCode and one totalSupply() read, and reads nothing for a repeat', async () => {
    expect((await paid.request(`/api/risk/rugcheck?address=${TOKEN}`)).status).toBe(402);
    expect((await paid.request(`/api/risk/token?token=${TOKEN}`)).status).toBe(402);
    expect(chain.reads.sort()).toEqual(['code', 'totalSupply']);
    expect(redis.set).toHaveBeenCalledWith(KIND(TOKEN), 'token', 'EX', 7 * 86_400);
  });

  it('keeps "not a token" briefly: fifteen seconds for an empty address (a token can launch there), five minutes for a contract', async () => {
    chain.code = '0x';
    await paid.request(`/api/risk/rugcheck?address=${EOA}`);
    expect(redis.set).toHaveBeenCalledWith(KIND(EOA), 'not_a_contract', 'EX', 15);
    chain.code = '0x6080604052';
    chain.supply = false;
    await paid.request(`/api/risk/rugcheck?address=${FACTORY}`);
    expect(redis.set).toHaveBeenCalledWith(KIND(FACTORY), 'not_a_token', 'EX', 300);
    chain.reads = [];
    expect((await paid.request(`/api/risk/rugcheck?address=${FACTORY}`)).status).toBe(400);
    expect(chain.reads).toEqual([]);
  });

  it('reads nothing for the bare URL', async () => {
    expect((await paid.request('/api/risk/rugcheck')).status).toBe(402);
    expect(chain.reads).toEqual([]);
  });

  // The check refuses a non-token after payment too, so this read only spares a signature: it fails open.
  it('asks for payment when the chain read fails', async () => {
    chain.fail = true;
    expect((await paid.request(`/api/risk/rugcheck?address=${EOA}`)).status).toBe(402);
  });

  it('asks for payment, reading nothing, once the reads before payment are past their cap', async () => {
    redis.spentOut = 'bud:token-kind';
    chain.code = '0x';
    expect((await paid.request(`/api/risk/rugcheck?address=${EOA}`)).status).toBe(402);
    expect(chain.reads).toEqual([]);
  });

  it('shows the freshness fields in the 402 challenge example', async () => {
    const challenge = JSON.stringify(challengeOf(await paid.request(`/api/risk/rugcheck?address=${TOKEN}`)));
    for (const field of ['checked_at', 'cached', 'age_seconds']) expect(challenge).toContain(field);
  });
});

describe('the token check handler, for an answer that is not a token', () => {
  // An NFT collection answers totalSupply(), so only the check itself finds it is not a token.
  it('refuses a not-a-token answer with 400 NOT_A_TOKEN instead of an answer the payment would settle', async () => {
    checks.result = {
      verdict: { label: 'review', reason: 'This contract is an NFT collection (ERC-721), not an ERC-20 token.' },
      flags: ['not_a_token'],
    };
    const res = await open.request(`/api/risk/rugcheck?token=0x${'4'.repeat(40)}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toMatchObject({ code: 'NOT_A_TOKEN', details: { flag: 'not_a_token' } });
    expect(body.error.message).toMatch(/NFT collection/);
  });

  it('answers a look-alike that is not a full ERC-20: its hold is the answer', async () => {
    checks.result = {
      verdict: { label: 'hold', reason: 'Its symbol passes for USDC, whose real contract on Base is 0x8335…2913.' },
      flags: ['not_a_token', 'imitates_known_token'],
    };
    const res = await open.request(`/api/risk/rugcheck?token=0x${'5'.repeat(40)}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { verdict: { label: string } } }).data.verdict.label).toBe('hold');
  });
});

// "What an agent would want", item 8: when the answer was read, and whether it came from the cache.
describe('how fresh a rug check answer is', () => {
  it('says a fresh answer is not cached and when it was read, and a repeat is cached and how old it is', async () => {
    const T6 = `0x${'6'.repeat(40)}`;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T18:00:00.000Z'));
    const fresh = (await (await open.request(`/api/risk/rugcheck?token=${T6}`)).json()) as { data: Record<string, unknown> };
    expect(fresh.data).toMatchObject({ token: T6, verdict: { label: 'review' }, checked_at: '2026-10-22T18:00:00.000Z', cached: false, age_seconds: 0 });
    vi.setSystemTime(new Date('2026-10-22T18:00:42.900Z'));
    const repeat = (await (await open.request(`/api/risk/token?address=${T6}`)).json()) as { data: Record<string, unknown> };
    expect(repeat.data).toMatchObject({ token: T6, checked_at: '2026-10-22T18:00:00.000Z', cached: true, age_seconds: 42 });
    expect(checks.calls).toBe(1);
    // Only when it was read is kept: cached and age_seconds describe each answer as it is sent.
    const stored = JSON.parse(redis.store.get(SHARED(T6))!) as Record<string, unknown>;
    expect(stored.checked_at).toBe('2026-10-22T18:00:00.000Z');
    expect(stored).not.toHaveProperty('cached');
    expect(stored).not.toHaveProperty('age_seconds');
  });
});
