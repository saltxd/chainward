import { Hono } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';
import { getRedis } from '../lib/redis.js';

// GET /api/set-and-earn/board — the daily Set and Earn board the indexer builds
// (packages/indexer/src/workers/setAndEarnBoard.ts). Free to read.
const setAndEarnBoard = new Hono();

setAndEarnBoard.get('/board', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:set-and-earn-board' }), async (c) => {
  const raw = await getRedis().get('set-and-earn:board:latest');
  if (!raw) return c.json({ success: false, error: 'board not built yet' }, 503);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ success: true, data: JSON.parse(raw) });
});

export { setAndEarnBoard };
