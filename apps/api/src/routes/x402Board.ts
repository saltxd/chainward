import { Hono } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRedis } from '../lib/redis.js';

// GET /api/x402/board — the weekly x402 seller board the indexer builds
// (packages/indexer/src/workers/x402Board.ts). Free to read.
const x402Board = new Hono();

x402Board.get('/board', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:x402-board' }), async (c) => {
  const raw = await getRedis().get('x402:board:latest');
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'The first x402 seller board is still being built');
  c.header('Cache-Control', 'public, max-age=600');
  return c.json({ success: true, data: JSON.parse(raw) });
});

export { x402Board };
