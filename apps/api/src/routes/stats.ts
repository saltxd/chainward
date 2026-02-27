import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { StatsService } from '../services/statsService.js';
import { getDb } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const stats = new Hono<{ Variables: AppVariables }>();
stats.use('*', requireAuth);

stats.get('/overview', async (c) => {
  const user = c.get('user');
  const service = new StatsService(getDb());
  const data = await service.getOverview(user.id);
  return c.json({ success: true, data });
});

stats.get('/agents/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const service = new StatsService(getDb());
  const data = await service.getAgentStats(user.id, id);
  if (!data) throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');

  return c.json({ success: true, data });
});

export { stats };
