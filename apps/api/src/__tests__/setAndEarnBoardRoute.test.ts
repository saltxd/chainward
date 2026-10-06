import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// GET /api/set-and-earn/board: serves the document the indexer builds
// (packages/indexer/src/workers/setAndEarnBoard.ts). Free; no real Redis.
const redis = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<string | null>>(),
  // rateLimit(): zremrangebyscore, zcard, zadd, expire → exec()
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
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));

import { setAndEarnBoard } from '../routes/setAndEarnBoard.js';
import { handleError } from '../middleware/errorHandler.js';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/set-and-earn', setAndEarnBoard);
  return a;
}

describe('GET /api/set-and-earn/board', () => {
  beforeEach(() => {
    redis.get.mockReset().mockResolvedValue(null);
  });

  it('serves the latest board from Redis, cacheable for 5 minutes', async () => {
    const board = { generated_at: '2026-10-06T06:00:00.000Z', totals: { agents_registered: 3 }, rows: [] };
    redis.get.mockImplementation(async (key) => (key === 'set-and-earn:board:latest' ? JSON.stringify(board) : null));
    const res = await app().request('/api/set-and-earn/board');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await res.json()).toEqual({ success: true, data: board });
  });

  it('answers 503 until the first board is built', async () => {
    const res = await app().request('/api/set-and-earn/board');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, error: 'board not built yet' });
  });
});
