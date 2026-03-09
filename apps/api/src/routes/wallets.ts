import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRedis } from '../lib/redis.js';
import { WalletLookupService } from '../services/walletLookupService.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

const wallets = new Hono();

// IP-based rate limit: 20 requests per hour (applies on top of global limit)
wallets.use('/*', rateLimit({ max: 20, windowSec: 3600, prefix: 'rl:wallets' }));

wallets.get('/:address', async (c) => {
  const rawAddress = c.req.param('address');

  const parsed = addressSchema.safeParse(rawAddress);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_ADDRESS', parsed.error.issues[0]?.message ?? 'Invalid Ethereum address');
  }

  const service = new WalletLookupService(getRedis());
  const result = await service.lookup(parsed.data);

  return c.json({ success: true, data: result });
});

export { wallets };
