import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';

// One signed payment sent on many simultaneous requests used to pass verification
// on each and run every handler (the payment middleware settles after the handler,
// and only the first settle lands). The in-flight lock lets one request through per
// payer + EIP-3009 nonce and answers the rest 409 without running the handler.
const store = vi.hoisted(() => new Map<string, string>());
const redis = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
    if (args.includes('NX') && store.has(key)) return null;
    store.set(key, value);
    return 'OK';
  }),
  del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
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
}));
const db = vi.hoisted(() => ({ rows: (_params: unknown[]): unknown[] => [], lookups: 0 }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
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
      // recordSettlement's insert after a settle.
      q.insert = () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) });
      return q;
    },
  };
});

import { createApp } from '../app.js';
import { x402CheckMiddleware } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const PAY_TO = '0x000000000000000000000000000000000000dEaD';
const BUYER = '0x1111111111111111111111111111111111111111';
const PATH = `/api/paid/termix-wallets/check?address=${ADDR}`;

const datasetRow = {
  slug: 'termix-wallets',
  title: 'TermiX wallets',
  description: 'test',
  filename: 'termix-wallets.csv',
  contentType: 'text/csv',
  priceUsdc: 10_000_000,
  sizeBytes: 10,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

/** The facilitator: /verify always valid; /settle waits on `settleGate` and answers `settleOk`. */
const facilitator = {
  settleOk: true,
  settleCalls: 0,
  settleGate: null as Promise<void> | null,
  onSettle: null as (() => void) | null,
};

async function facilitatorFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  if (href.endsWith('/supported')) {
    return json({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: [], signers: {} });
  }
  if (href.endsWith('/verify')) return json({ isValid: true, payer: BUYER });
  if (href.endsWith('/settle')) {
    facilitator.settleCalls++;
    facilitator.onSettle?.();
    if (facilitator.settleGate) await facilitator.settleGate;
    return facilitator.settleOk
      ? json({ success: true, transaction: `0x${'ab'.repeat(32)}`, network: 'eip155:8453', payer: BUYER })
      : json({ success: false, errorReason: 'invalid_transaction_state', transaction: '', network: 'eip155:8453', payer: BUYER });
  }
  throw new Error(`unexpected fetch in test: ${href}`);
}

describe('x402: one signed payment runs one request at a time', () => {
  let app: ReturnType<typeof createApp>;
  let paymentHeader: (nonce: string) => string;

  beforeAll(async () => {
    vi.stubEnv('X402_PAY_TO', PAY_TO);
    vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
    db.rows = (params) => {
      // The handler's dataset lookup is the only query keyed on the wallet.
      if (params.includes(ADDR)) db.lookups++;
      return params.includes('termix-wallets') && !params.includes(ADDR) ? [datasetRow] : [];
    };
    app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
    // The challenge tells the buyer what to sign.
    const challenge = await app.request(PATH);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequiredHeader(challenge.headers.get('payment-required')!);
    const accepted = required.accepts[0]!;
    paymentHeader = (nonce) =>
      encodePaymentSignatureHeader({
        x402Version: 2,
        resource: required.resource,
        accepted,
        payload: {
          authorization: {
            from: BUYER,
            to: accepted.payTo,
            value: accepted.amount,
            validAfter: '0',
            validBefore: String(Math.floor(Date.now() / 1000) + 120),
            nonce,
          },
          signature: `0x${'cd'.repeat(65)}`,
        },
      });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    store.clear();
    facilitator.settleOk = true;
    facilitator.settleCalls = 0;
    facilitator.settleGate = null;
    facilitator.onSettle = null;
    db.lookups = 0;
  });

  const nonce = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

  it('answers a second concurrent request with the same payment 409, without running its handler', async () => {
    let release!: () => void;
    facilitator.settleGate = new Promise<void>((r) => (release = r));
    const settling = new Promise<void>((r) => (facilitator.onSettle = r));
    const header = paymentHeader(nonce(1));

    const first = app.request(PATH, { headers: { 'payment-signature': header } });
    await settling;
    const second = await app.request(PATH, { headers: { 'payment-signature': header } });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body).toEqual({
      success: false,
      error: { code: 'PAYMENT_IN_USE', message: 'This payment is already being used by another request.' },
    });

    release();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers.get('payment-response')).toBeTruthy();
    expect(facilitator.settleCalls).toBe(1);
    expect(db.lookups).toBe(1);
  });

  it('keeps the payment locked after it settled', async () => {
    const header = paymentHeader(nonce(2));
    expect((await app.request(PATH, { headers: { 'payment-signature': header } })).status).toBe(200);
    expect((await app.request(PATH, { headers: { 'payment-signature': header } })).status).toBe(409);
    expect(facilitator.settleCalls).toBe(1);
  });

  it('releases the payment when settlement failed, so the same signature can be retried', async () => {
    facilitator.settleOk = false;
    const header = paymentHeader(nonce(3));
    const failed = await app.request(PATH, { headers: { 'payment-signature': header } });
    expect(failed.status).toBe(402);
    facilitator.settleOk = true;
    const retried = await app.request(PATH, { headers: { 'payment-signature': header } });
    expect(retried.status).toBe(200);
    expect(facilitator.settleCalls).toBe(2);
  });

  it('locks the same nonce sent as a v1 X-PAYMENT header too', async () => {
    let release!: () => void;
    facilitator.settleGate = new Promise<void>((r) => (release = r));
    const settling = new Promise<void>((r) => (facilitator.onSettle = r));
    const header = paymentHeader(nonce(4));
    const first = app.request(PATH, { headers: { 'payment-signature': header } });
    await settling;
    expect((await app.request(PATH, { headers: { 'x-payment': header } })).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });

  it('lets different payments through side by side', async () => {
    const [a, b] = await Promise.all([
      app.request(PATH, { headers: { 'payment-signature': paymentHeader(nonce(5)) } }),
      app.request(PATH, { headers: { 'payment-signature': paymentHeader(nonce(6)) } }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('leaves requests without a payment header alone', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.request(PATH);
      expect(res.status).toBe(402);
      expect(res.headers.get('payment-required')).toBeTruthy();
    }
    expect(store.size).toBe(0);
  });

  it('passes an unreadable payment header on to the payment middleware, which refuses it', async () => {
    const res = await app.request(PATH, { headers: { 'payment-signature': 'not base64 json!' } });
    expect(res.status).toBe(402);
    expect(store.size).toBe(0);
  });
});
