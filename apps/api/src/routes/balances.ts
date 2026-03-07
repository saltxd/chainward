import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { BalanceService } from '../services/balanceService.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';

const balances = new Hono<{ Variables: AppVariables }>();
balances.use('*', requireApiKeyOrSession());

balances.get('/latest', async (c) => {
  const user = c.get('user');
  const service = new BalanceService(getDb());
  const data = await service.getLatest(user.id);
  return c.json({ success: true, data });
});

balances.get('/history', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const service = new BalanceService(getDb());
  const data = await service.getHistory(
    user.id,
    query.wallet,
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined,
    query.bucket ?? '1h',
  );

  return c.json({ success: true, data });
});

export { balances };
