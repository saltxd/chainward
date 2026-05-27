import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { findDecodesForAddress, listDecodes } from '../lib/decodeManifest.js';

const walletParamSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const publicDecodes = new Hono();

publicDecodes.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:pub-decodes' }));

publicDecodes.get('/', async (c) => {
  return c.json({ success: true, data: listDecodes() });
});

publicDecodes.get('/lookup/:wallet', async (c) => {
  const parsed = walletParamSchema.safeParse(c.req.param('wallet'));
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_WALLET', 'Invalid wallet address format');
  }
  const matches = findDecodesForAddress(parsed.data);
  return c.json({ success: true, data: matches });
});

export { publicDecodes };
