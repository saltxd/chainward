import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { TxService } from '../services/txService.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';

const txRoutes = new Hono<{ Variables: AppVariables }>();
txRoutes.use('*', requireApiKeyOrSession());

txRoutes.get('/', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const service = new TxService(getDb());
  const result = await service.list(user.id, {
    walletAddress: query.wallet,
    chain: query.chain,
    direction: query.direction,
    txType: query.type,
    status: query.status,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    search: query.search,
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined,
  });

  return c.json({ success: true, ...result });
});

txRoutes.get('/stats', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const bucket = query.bucket === '1d' ? '1d' : '1h';

  const service = new TxService(getDb());
  const data = await service.getVolumeStats(
    user.id,
    query.wallet,
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined,
    bucket,
  );

  return c.json({ success: true, data });
});

export { txRoutes };
