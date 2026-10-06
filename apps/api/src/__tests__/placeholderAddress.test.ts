import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PLACEHOLDER_ADDRESS_PATTERN } from '@chainward/common';

// Near-zero placeholder addresses (0x…0001, precompiles) are refused as check
// targets and kept out of the public library, which feeds the sitemap, /reports
// and the recently-checked list. The DB is faked: it records each query's WHERE.
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
const riskCheck = vi.hoisted(() => ({ add: vi.fn() }));
const db = vi.hoisted(() => ({ wheres: [] as Array<{ sql: string; params: unknown[] }> }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', async () => {
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  return {
    getDb: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'from', 'orderBy', 'limit']) q[m] = () => q;
      q.where = (cond: Parameters<typeof dialect.sqlToQuery>[0]) => {
        db.wheres.push(dialect.sqlToQuery(cond));
        return q;
      };
      q.offset = async () => [];
      q.then = (resolve: (rows: unknown[]) => unknown) => resolve([]);
      return q;
    },
  };
});

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const ZERO_ONE = '0x0000000000000000000000000000000000000001';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

describe('placeholder addresses', () => {
  beforeEach(() => {
    db.wheres = [];
    riskCheck.add.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no network: a placeholder must be refused before any lookup');
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['base', { target: ZERO_ONE }],
    ['bsc', { target: ZERO_ONE, chain: 'bsc' }],
    ['a forced re-check', { target: ZERO_ONE, force_recheck: true }],
  ])('POST /check refuses one (%s) with 400 and files nothing', async (_label, body) => {
    const res = await app().request('/api/risk/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('INVALID_TARGET');
    expect(db.wheres).toEqual([]);
    expect(riskCheck.add).not.toHaveBeenCalled();
  });

  it.each(['', '?chain=bsc'])('GET /report/<placeholder>%s answers 400', async (query) => {
    const res = await app().request(`/api/risk/report/${ZERO_ONE}${query}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('INVALID_TARGET');
    expect(db.wheres).toEqual([]);
  });

  it('GET /library leaves placeholders out of the listing', async () => {
    const res = await app().request('/api/risk/library?sort=recent&limit=50');
    expect(res.status).toBe(200);
    const where = db.wheres[0]!;
    expect(where.sql).toContain('!~*');
    expect(where.params).toContain(PLACEHOLDER_ADDRESS_PATTERN);
  });
});
