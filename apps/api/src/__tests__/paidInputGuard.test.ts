import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiddlewareHandler } from 'hono';

// The paid routes through the full app (createApp) with the real x402 payment
// middleware. Bad input must be refused with 400 before the 402 challenge, so a
// client never signs a payment for a request that can only fail. The facilitator
// is faked at fetch: it only has to answer /supported for the 402 to be built.
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
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
// Rows the fake DB answers for a query, given the query's bound parameters.
const db = vi.hoisted(() => ({ rows: (_params: unknown[]): unknown[] => [] }));

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
      return q;
    },
  };
});

import { createApp } from '../app.js';
import { x402CheckMiddleware } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const PAY_TO = '0x000000000000000000000000000000000000dEaD';

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

function facilitatorFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  if (href.endsWith('/supported')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }],
          extensions: [],
          signers: {},
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${href}`));
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

describe('paid routes: input checked before the 402 challenge', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    vi.stubEnv('X402_PAY_TO', PAY_TO);
    vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
    app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    db.rows = (params) => (params.includes('termix-wallets') ? [datasetRow] : []);
  });

  const tooLongAgent = '1'.repeat(5000);
  it.each([
    '/api/risk/x402?address=0xzz',
    '/api/risk/x402',
    '/api/risk/x402/0xzz',
    `/api/risk/x402/${encodeURIComponent('\u{1F600}')}`,
    `/api/risk/x402?address=${ADDR}&chain=eth`,
    `/api/risk/x402?address=${ADDR}&chain=BSC`,
    `/api/risk/x402/${ADDR}?chain=eth`,
    '/api/risk/seller-demand?address=nope',
    '/api/risk/seller-demand',
    `/api/risk/seller-demand?address=${ADDR}&chain=eth`,
    '/api/risk/hires?agent=abc',
    '/api/risk/hires',
    '/api/risk/hires?agent=352475&chain=base',
    '/api/risk/hires?agent=<5000 digits>',
    '/api/risk/hires?agent=1234567890123',
    '/api/paid/NOPE/file',
  ])('GET %s answers 400 with no payment challenge', async (path) => {
    const res = await app.request(path.replace('<5000 digits>', tooLongAgent));
    expect(res.status).toBe(400);
    expect(res.headers.get('payment-required')).toBeNull();
    const body = (await res.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toMatch(/^INVALID_/);
  });

  it('answers 404 with no payment challenge for a dataset that does not exist', async () => {
    const res = await app.request('/api/paid/no-such-dataset/file');
    expect(res.status).toBe(404);
    expect(res.headers.get('payment-required')).toBeNull();
  });

  it.each([
    `/api/risk/x402?address=${ADDR}`,
    `/api/risk/x402?address=${ADDR}&chain=bsc`,
    `/api/risk/x402/${ADDR}`,
    `/api/risk/seller-demand?address=${ADDR}&chain=bsc`,
    '/api/risk/hires?agent=352475&chain=bsc',
    `/api/risk/hires?agent=${ADDR}`,
    '/api/paid/termix-wallets/file',
  ])('GET %s (valid, unpaid) still answers 402 with the challenge', async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(402);
    expect(res.headers.get('payment-required')).toBeTruthy();
  });
});

describe('paid routes: payment middleware runs once per request', () => {
  it.each([`/api/risk/x402?address=${ADDR}`, `/api/risk/x402/${ADDR}`])('GET %s', async (path) => {
    let calls = 0;
    const counting: MiddlewareHandler = async (_c, next) => {
      calls++;
      await next();
    };
    db.rows = () => {
      throw new Error('stop after the payment layer');
    };
    const app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: counting });
    await app.request(path);
    // Twice would verify and settle the same payment twice: the inner run settles,
    // the outer one then fails to settle and replaces the report with an error.
    expect(calls).toBe(1);
  });
});
