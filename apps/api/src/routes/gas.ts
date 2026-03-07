import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { GasService } from '../services/gasService.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';

const gas = new Hono<{ Variables: AppVariables }>();
gas.use('*', requireApiKeyOrSession());

gas.get('/analytics', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const service = new GasService(getDb());
  const data = await service.getAnalytics(
    user.id,
    query.wallet,
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined,
    query.bucket ?? '1h',
  );

  return c.json({ success: true, data });
});

export { gas };
