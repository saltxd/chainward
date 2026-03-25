import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { GasService } from '../services/gasService.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { safeDate } from '../lib/queryParams.js';

const gas = new Hono<{ Variables: AppVariables }>();
gas.use('*', requireApiKeyOrSession());

gas.get('/analytics', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const bucket = query.bucket === '1d' ? '1d' : '1h';

  const service = new GasService(getDb());
  const data = await service.getAnalytics(
    user.id,
    query.wallet,
    safeDate(query.from),
    safeDate(query.to),
    bucket,
  );

  return c.json({ success: true, data });
});

export { gas };
