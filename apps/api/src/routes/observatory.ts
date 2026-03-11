import { Hono } from 'hono';
import { ObservatoryService } from '../services/observatoryService.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { rateLimit } from '../middleware/rateLimit.js';

let _service: ObservatoryService | null = null;
function getService(): ObservatoryService {
  if (!_service) _service = new ObservatoryService(getDb(), getRedis());
  return _service;
}

const observatory = new Hono();

// Public endpoints — 60 req/min per IP, no auth required
observatory.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:observatory' }));

observatory.get('/', async (c) => {
  const data = await getService().getOverview();
  return c.json({ success: true, data });
});

observatory.get('/feed', async (c) => {
  const data = await getService().getFeed();
  return c.json({ success: true, data });
});

observatory.get('/leaderboard', async (c) => {
  const data = await getService().getLeaderboard();
  return c.json({ success: true, data });
});

observatory.get('/trends', async (c) => {
  const data = await getService().getTrends();
  return c.json({ success: true, data });
});

observatory.get('/alerts', async (c) => {
  const data = await getService().getAlertActivity();
  return c.json({ success: true, data });
});

export { observatory };
