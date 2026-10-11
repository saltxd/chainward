import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The free lookup says whether a wallet is in a dataset and at what tier. The row's
// fields are what the paid $0.05 check sells, so the free answer leaves them out.
const redis = vi.hoisted(() => ({
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
      // The lookup awaits the query without a limit.
      q.then = (resolve: (v: unknown) => unknown) => resolve(db.rows(params));
      return q;
    },
  };
});

import { paid } from '../routes/paid.js';
import { handleError } from '../middleware/errorHandler.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
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
const lookupRows = [
  { chain: 'base', tier: 'A1', fields: { cluster: 'B0004', jobs_as_buyer: 103 } },
  { chain: 'bsc', tier: 'B2', fields: { cluster: 'C0001' } },
];

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/paid', paid);
  return a;
}

describe('GET /api/paid/:slug/lookup/:address (free)', () => {
  beforeEach(() => {
    db.rows = (params) => (params.includes(ADDR) ? lookupRows : params.includes('termix-wallets') ? [datasetRow] : []);
  });

  it('answers found with the chain and tier of each match, and no fields', async () => {
    const res = await app().request(`/api/paid/termix-wallets/lookup/${ADDR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({
      address: ADDR,
      found: true,
      matches: [
        { chain: 'base', tier: 'A1' },
        { chain: 'bsc', tier: 'B2' },
      ],
    });
  });

  it('answers not found with no matches', async () => {
    db.rows = (params) => (params.includes('termix-wallets') && !params.includes(ADDR) ? [datasetRow] : []);
    const res = await app().request(`/api/paid/termix-wallets/lookup/${ADDR}`);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ address: ADDR, found: false, matches: [] });
  });
});
