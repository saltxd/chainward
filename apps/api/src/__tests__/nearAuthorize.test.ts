import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASSIFIER_VERSION } from '@chainward/decode';

// POST /api/near/authorize: the verdict the NEAR payment guard contract checks before
// it pays (saltxd/near-payment-guard). It runs the counterparty check (with its decoy
// step) and the sanctions list, and signs pay/hold/unknown over the guard's canonical
// bytes with an ed25519 key that only ever comes from NEAR_VERDICT_SIGNING_KEY.
// Unset, the route answers 503 and signs nothing, so it ships dark.
//
// The key here is a THROWAWAY derived from a phrase inside this test. It protects
// nothing. The production key is generated once and lives only in a k8s secret.

const redis = vi.hoisted(() => {
  const strings = new Map<string, string>();
  /** What zcard answers: how much of every rate window is already used. */
  const window = { used: 0 };
  const pipeline = () => {
    const p: Record<string, unknown> = {
      exec: async () => [
        [null, 0],
        [null, window.used],
        [null, 1],
        [null, 1],
      ],
    };
    for (const m of ['zremrangebyscore', 'zcard', 'zadd', 'zrem', 'expire']) p[m] = () => p;
    return p;
  };
  return {
    strings,
    window,
    get: vi.fn(async (k: string) => strings.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => (strings.set(k, v), 'OK')),
    zrem: async () => 1,
    zrange: async () => [],
    pipeline,
  };
});
const job = vi.hoisted(() => ({ id: 'job-1', getState: vi.fn(async () => 'completed') }));
const riskCheck = vi.hoisted(() => ({ add: vi.fn(async () => job) }));
/** latestReport() answers, in order; the last one repeats. */
const reports = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) q[m] = () => q;
  q.limit = async () => (reports.queue.length > 1 ? reports.queue.shift() : reports.queue[0]) ?? [];
  return { getDb: () => q };
});
// No public labels on any of these addresses.
vi.mock('../lib/labels.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/labels.js')>()),
  labelsFor: async () => [],
}));
// Our node's wallet lookup: nothing there either, so an unread address is no_history.
vi.mock('../services/walletLookupService.js', () => ({
  WalletLookupService: class {
    async lookup() {
      return { balances: [], transactions: [] };
    }
  },
}));

import { createApp } from '../app.js';
import { canonicalBytes, toHex } from '../lib/near/canonical.js';
import { keyPairFromSeed, verifyAuth } from '../lib/near/sign.js';
import type { PaymentAuth } from '../lib/near/types.js';
import { fitReason } from '../lib/near/signer.js';

const ENV_KEY = 'NEAR_VERDICT_SIGNING_KEY';
const TEST_SEED = createHash('sha256').update('chainward near-authorize route tests, throwaway, protects nothing', 'utf8').digest();
const TEST_SIGNER = keyPairFromSeed(new Uint8Array(TEST_SEED));

/** Fixed clock: the fixture below must come out byte-identical on every run. */
const NOW = new Date('2026-11-06T12:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

// Lazarus Group, Ronin Bridge exploit: on the OFAC SDN list.
const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';
// Synthetic addresses: the reports below are mocks, not readings of a real wallet.
const CLEAN = '0x1111111111111111111111111111111111111111';
const DECOY = '0x2222222222222222222222222222222222222222';
const QUIET = '0x3333333333333333333333333333333333333333';
const GUARD = 'guard.chainward.near';
const DEPOSIT = '1c'.repeat(32);

const FIXTURE_URL = new URL('./fixtures/near/chainward-authorize.json', import.meta.url);

function request(overrides: Record<string, unknown> = {}) {
  return {
    guard_id: GUARD,
    deposit_address: DEPOSIT,
    destination: CLEAN,
    chain: 'base',
    amount: '1000000',
    quote_expiry: NOW_SEC + 600,
    nonce: '7001',
    ...overrides,
  };
}

/** A stored counterparty report, as the risk-check worker files one. */
function row(address: string, opts: { flags?: unknown[]; nonce?: number; transfers?: number; decoyCheck?: string } = {}) {
  const flags = opts.flags ?? [];
  const transfers = opts.transfers ?? 42;
  return {
    id: `r-${address}`,
    walletAddress: address,
    chain: 'base',
    asOfBlock: 52_276_747,
    classifierVersion: CLASSIFIER_VERSION,
    band: flags.length ? 'mixed' : 'low-signal',
    flagCount: flags.length,
    topFlags: [],
    viewCount: 0,
    attestationUid: null,
    attestationTx: null,
    attestedAt: null,
    generatedAt: new Date(),
    riskAssessment: { band: flags.length ? 'mixed' : 'low-signal', flags, not_assessed: ['x'], classifier_version: CLASSIFIER_VERSION, signal_density: 0 },
    reportData: {
      wallet: { type: 'eoa', nonce: opts.nonce ?? 120, code_size: 0 },
      activity: { transfers_30d: transfers, unique_counterparties_30d: transfers ? 9 : 0, latest_transfer_age_hours: transfers ? 3 : null },
      fetch_meta: { transfers_fetched: transfers, transfers_truncated: false, decoy_check: opts.decoyCheck ?? 'not_applicable' },
      survival: { classification: 'active' },
    },
  };
}

const DECOY_FLAG = {
  id: 'poisoning_decoy',
  severity: 'high',
  title: 'Looks like an address-poisoning decoy',
  evidence: 'Its first and last 4 characters match the recipient of a real USDC payment.',
  summary:
    'It looks like an address-poisoning decoy: a never-used address made to match the first and last characters of a real one, so it gets copied from wallet history by mistake. Get the full address from whoever you are paying.',
  source: 'https://base.blockscout.com/address/0x2222222222222222222222222222222222222222',
};

/**
 * One request through the whole app. The clock stays at NOW unless `decode` is set, so a
 * verdict served without a decode is stamped issued_at = NOW exactly (the fixture needs it).
 */
async function authorize(body: unknown, opts: { decode?: boolean } = {}) {
  const app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
  const pending = Promise.resolve(
    app.request('/api/near/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  // The counterparty check polls its decode every 1.5 s.
  if (opts.decode) await vi.advanceTimersByTimeAsync(5_000);
  const res = await pending;
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

/** The contract's PaymentAuthArgs JSON back into the encoder's type. */
function authFrom(json: Record<string, string>): PaymentAuth {
  return {
    guardId: json.guard_id!,
    depositAddress: json.deposit_address!,
    destination: json.destination!,
    chain: json.chain as PaymentAuth['chain'],
    amount: BigInt(json.amount!),
    verdict: json.verdict as PaymentAuth['verdict'],
    reason: json.reason!,
    issuedAt: BigInt(json.issued_at!),
    quoteExpiry: BigInt(json.quote_expiry!),
    nonce: BigInt(json.nonce!),
  };
}

function expectSignedBy(data: any, publicKey: Uint8Array) {
  expect(data.public_key).toBe(Buffer.from(publicKey).toString('base64'));
  const signature = new Uint8Array(Buffer.from(data.signature, 'base64'));
  expect(signature).toHaveLength(64);
  expect(verifyAuth(authFrom(data.auth), signature, publicKey)).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  process.env[ENV_KEY] = TEST_SEED.toString('hex');
  riskCheck.add.mockClear();
  redis.strings.clear();
  redis.window.used = 0;
  reports.queue = [[]];
  // Blockscout counters: some history, so a missing report means a decode.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ transactions_count: '5', token_transfers_count: '9' }))));
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('POST /api/near/authorize without a signing key', () => {
  it('answers 503 NOT_CONFIGURED and runs no check', async () => {
    delete process.env[ENV_KEY];
    const { status, body } = await authorize(request());
    expect(status).toBe(503);
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(riskCheck.add).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 503 for a key that is not a 64-hex-character seed, and never echoes it', async () => {
    process.env[ENV_KEY] = 'not-a-key-zzzz';
    const { status, body } = await authorize(request());
    expect(status).toBe(503);
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(JSON.stringify(body)).not.toContain('not-a-key-zzzz');
  });

  it('serves no public key either', async () => {
    delete process.env[ENV_KEY];
    const app = createApp({ corsOrigins: [], x402Check: null });
    const res = await app.request('/api/near/public-key');
    expect(res.status).toBe(503);
  });
});

describe('POST /api/near/authorize input', () => {
  it.each([
    ['a body that is not JSON', '{nope'],
    ['a missing destination', request({ destination: undefined })],
    ['a destination that is not an address', request({ destination: '0x1234' })],
    ['a placeholder destination', request({ destination: '0x0000000000000000000000000000000000000001' })],
    ['an unsupported chain', request({ chain: 'ethereum' })],
    ['a numeric amount (u128 does not survive JSON numbers)', request({ amount: 1000000 })],
    ['a zero amount', request({ amount: '0' })],
    ['a negative amount', request({ amount: '-5' })],
    ['an amount above u128', request({ amount: (2n ** 128n).toString() })],
    ['a deposit address with a space', request({ deposit_address: 'bad address' })],
    ['an empty deposit address', request({ deposit_address: '' })],
    ['a guard id that is not a NEAR account', request({ guard_id: 'Guard..near' })],
    ['a quote that already expired', request({ quote_expiry: NOW_SEC - 1 })],
    ['a quote expiry above u64', request({ quote_expiry: (2n ** 64n).toString() })],
    ['a nonce that is not a decimal string', request({ nonce: 'abc' })],
    ['a nonce above u128', request({ nonce: (2n ** 128n).toString() })],
  ])('refuses %s with 400 and runs no check', async (_name, body) => {
    const { status, body: res } = await authorize(body);
    expect(status).toBe(400);
    expect(res.success).toBe(false);
    expect(riskCheck.add).not.toHaveBeenCalled();
  });

  it('lowercases a checksummed destination before signing (the signed bytes are exact)', async () => {
    const checksummed = `0x${SANCTIONED.slice(2).toUpperCase()}`;
    const { status, body } = await authorize(request({ destination: checksummed }));
    expect(status).toBe(200);
    expect(body.data.auth.destination).toBe(SANCTIONED);
    expect(body.data.auth.verdict).toBe('hold');
  });

  it('picks a random nonce when none is given', async () => {
    const a = await authorize(request({ destination: SANCTIONED, nonce: undefined }));
    const b = await authorize(request({ destination: SANCTIONED, nonce: undefined }));
    expect(a.status).toBe(200);
    expect(a.body.data.auth.nonce).toMatch(/^\d+$/);
    expect(a.body.data.auth.nonce).not.toBe(b.body.data.auth.nonce);
    expectSignedBy(a.body.data, TEST_SIGNER.publicKeyBytes);
  });
});

describe('POST /api/near/authorize verdicts', () => {
  it('holds a sanctioned destination from the list alone, still signed, with no chain read', async () => {
    const { status, body } = await authorize(request({ destination: SANCTIONED }));
    expect(status).toBe(200);
    expect(body.data.auth).toMatchObject({ verdict: 'hold', destination: SANCTIONED, guard_id: GUARD, deposit_address: DEPOSIT });
    expect(body.data.auth.reason).toMatch(/OFAC/);
    expect(body.data.verdict).toMatchObject({ label: 'hold', text: 'Hold' });
    expect(body.data.checks.sanctions).toEqual({ listed: true });
    expect(body.data.checks.counterparty.status).toBe('not_run');
    expectSignedBy(body.data, TEST_SIGNER.publicKeyBytes);
    expect(riskCheck.add).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pays a destination whose fresh counterparty report says Pay', async () => {
    reports.queue = [[row(CLEAN)]];
    const { status, body } = await authorize(request());
    expect(status).toBe(200);
    expect(body.data.auth).toMatchObject({
      guard_id: GUARD,
      deposit_address: DEPOSIT,
      destination: CLEAN,
      chain: 'base',
      amount: '1000000',
      verdict: 'pay',
      issued_at: String(NOW_SEC),
      quote_expiry: String(NOW_SEC + 600),
      nonce: '7001',
    });
    expect(body.data.auth.reason).toMatch(/^Active: 42 transfers/);
    expect(body.data.checks).toMatchObject({ sanctions: { listed: false }, counterparty: { status: 'ready', label: 'pay' } });
    expectSignedBy(body.data, TEST_SIGNER.publicKeyBytes);
    expect(riskCheck.add).not.toHaveBeenCalled();
  });

  it('holds a planted look-alike (the decoy step of the counterparty check), still signed', async () => {
    reports.queue = [[row(DECOY, { flags: [DECOY_FLAG], nonce: 0, decoyCheck: 'ran' })]];
    const { status, body } = await authorize(request({ destination: DECOY }));
    expect(status).toBe(200);
    expect(body.data.auth.verdict).toBe('hold');
    expect(body.data.auth.reason).toMatch(/address-poisoning decoy/);
    expect(body.data.checks.decoy).toEqual({ status: 'raised' });
    expectSignedBy(body.data, TEST_SIGNER.publicKeyBytes);
  });

  it('answers unknown for a destination with no history, signed so the agent can log why', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0' }))));
    const { status, body } = await authorize(request({ destination: QUIET }));
    expect(status).toBe(200);
    expect(body.data.auth.verdict).toBe('unknown');
    expect(body.data.verdict.text).toBe('No track record');
    expect(body.data.checks.counterparty).toMatchObject({ status: 'no_history', label: 'unknown' });
    expectSignedBy(body.data, TEST_SIGNER.publicKeyBytes);
    expect(riskCheck.add).not.toHaveBeenCalled();
  });

  it('runs a fresh decode when there is no report, spending the free decode allowance', async () => {
    reports.queue = [[], [row(CLEAN)]];
    const { status, body } = await authorize(request(), { decode: true });
    expect(status).toBe(200);
    expect(riskCheck.add).toHaveBeenCalledTimes(1);
    expect(body.data.auth.verdict).toBe('pay');
  });

  it('refuses with 429 and queues nothing once the free decode allowance is used up', async () => {
    redis.window.used = 10; // under the route's limit of 30, over the hourly 8 free decodes
    const { status, body } = await authorize(request());
    expect(status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(riskCheck.add).not.toHaveBeenCalled();
  });

  it('binds every field: a changed destination or deposit address no longer verifies', async () => {
    reports.queue = [[row(CLEAN)]];
    const { body } = await authorize(request());
    const signature = new Uint8Array(Buffer.from(body.data.signature, 'base64'));
    const auth = authFrom(body.data.auth);
    expect(verifyAuth({ ...auth, destination: DECOY }, signature, TEST_SIGNER.publicKeyBytes)).toBe(false);
    expect(verifyAuth({ ...auth, depositAddress: '2d'.repeat(32) }, signature, TEST_SIGNER.publicKeyBytes)).toBe(false);
    expect(verifyAuth({ ...auth, verdict: 'hold' }, signature, TEST_SIGNER.publicKeyBytes)).toBe(false);
  });

  it('is rate-limited per client by the existing middleware', async () => {
    const { headers } = await authorize(request({ destination: SANCTIONED }));
    expect(headers.get('X-RateLimit-Limit')).toBe('30');
    redis.window.used = 30;
    const { status } = await authorize(request({ destination: SANCTIONED }));
    expect(status).toBe(429);
  });

  it('is not listed or priced anywhere', async () => {
    const app = createApp({ corsOrigins: [], x402Check: null });
    for (const path of ['/openapi.json', '/.well-known/x402', '/']) {
      expect(await (await app.request(path)).text()).not.toContain('/api/near');
    }
  });
});

describe('GET /api/near/public-key', () => {
  it('serves the raw 32-byte key, base64 as set_chainward_pubkey takes it', async () => {
    const app = createApp({ corsOrigins: [], x402Check: null });
    const res = await app.request('/api/near/public-key');
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data.public_key).toBe(Buffer.from(TEST_SIGNER.publicKeyBytes).toString('base64'));
    expect(body.data.public_key_hex).toBe(toHex(TEST_SIGNER.publicKeyBytes));
  });
});

describe('fitReason', () => {
  it('keeps a short reason as it is', () => {
    expect(fitReason('This address is on the OFAC SDN list.')).toBe('This address is on the OFAC SDN list.');
  });

  it('cuts a long reason to 256 UTF-8 bytes on a character boundary', () => {
    const long = `${'é'.repeat(140)} and more`;
    const fitted = fitReason(long);
    expect(Buffer.byteLength(fitted, 'utf8')).toBeLessThanOrEqual(256);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitted).not.toContain('�');
  });

  it('replaces control characters the guard refuses', () => {
    expect(fitReason('line one\nline two\u0085end\u0000')).toBe('line one line two end');
  });
});

// The cross-repo proof. The guard repo (saltxd/near-payment-guard) carries a copy of
// this fixture and a Rust test that feeds it to the contract's own request_payment:
// the pay case must be paid, the hold case refused with its signed reason. This test
// pins the route to the committed fixture; WRITE_NEAR_FIXTURE=1 rewrites it.
describe('the cross-repo fixture', () => {
  it('matches what the route signs today', async () => {
    reports.queue = [[row(CLEAN)]];
    const payReq = request({ nonce: '7001' });
    const pay = await authorize(payReq);
    const holdReq = request({ destination: SANCTIONED, nonce: '7002' });
    const hold = await authorize(holdReq);
    expect(pay.body.data.auth.verdict).toBe('pay');
    expect(hold.body.data.auth.verdict).toBe('hold');

    const fixture = {
      $comment:
        'Written by chainward apps/api/src/__tests__/nearAuthorize.test.ts (WRITE_NEAR_FIXTURE=1): real responses of POST /api/near/authorize. ' +
        'Signed with a THROWAWAY key derived inside that test, which protects nothing; the production key lives only in a k8s secret. ' +
        'The verdicts rest on mocked counterparty reports for synthetic addresses, except the hold, which is a real OFAC SDN list match. ' +
        'canonical_hex is the vendored encoder over response.auth, for cross-checking guard-auth.',
      route: 'POST /api/near/authorize',
      cases: [
        { name: 'pay', request: payReq, response: pay.body.data, canonical_hex: toHex(canonicalBytes(authFrom(pay.body.data.auth))) },
        { name: 'hold-sanctioned', request: holdReq, response: hold.body.data, canonical_hex: toHex(canonicalBytes(authFrom(hold.body.data.auth))) },
      ],
    };
    const text = `${JSON.stringify(fixture, null, 2)}\n`;
    if (process.env.WRITE_NEAR_FIXTURE === '1') writeFileSync(FIXTURE_URL, text);
    expect(existsSync(fileURLToPath(FIXTURE_URL)), 'fixture missing: run with WRITE_NEAR_FIXTURE=1').toBe(true);
    expect(readFileSync(FIXTURE_URL, 'utf8')).toBe(text);
  });
});
