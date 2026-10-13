import { Hono, type Context } from 'hono';
import { alchemyWalletLookupDeps, lookupWallet, sellerDemandRpcUrl, type WalletLookup } from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { parseCounterpartyInput } from '../lib/paidInput.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Fast wallet lookup ───────────────────────────────────────────────────────
//
// GET /v1/wallet/:address?chain=base|bsc behind an ag_ API key (or a session),
// FREE_LOOKUPS_PER_MONTH per account; GET /api/risk/wallet?address= is the same
// lookup paid per call over x402 (app.ts mounts the payment middleware).

export const FREE_LOOKUPS_PER_MONTH = 1000;
const CACHE_TTL_SEC = 3600;
const QUOTA_TTL_SEC = 40 * 86_400;

async function cachedLookup(address: string, chain: 'base' | 'bsc'): Promise<WalletLookup> {
  const redis = getRedis();
  const cacheKey = `wallet-lookup:v1:${chain}:${address}`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit) as WalletLookup;
  const rpcUrl = sellerDemandRpcUrl(chain, process.env);
  if (!rpcUrl) throw new AppError(503, 'LOOKUP_UNAVAILABLE', 'Wallet lookup is not configured for this chain');
  const result = await lookupWallet(address, chain, alchemyWalletLookupDeps(rpcUrl));
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SEC);
  return result;
}

const walletV1 = new Hono();
walletV1.use('*', requireApiKeyOrSession('read'));
walletV1.get('/wallet/:address', rateLimit({ max: 120, windowSec: 60, prefix: 'rl:wallet-v1' }), async (c: Context) => {
  const { address, chain } = parseCounterpartyInput(c.req.param('address'), c.req.query('chain'));
  const user = c.get('user' as never) as { id: string };
  const redis = getRedis();
  const month = new Date().toISOString().slice(0, 7);
  const quotaKey = `wallet-lookup:quota:${user.id}:${month}`;
  const used = await redis.incr(quotaKey);
  if (used === 1) await redis.expire(quotaKey, QUOTA_TTL_SEC);
  if (used > FREE_LOOKUPS_PER_MONTH) {
    await redis.decr(quotaKey);
    throw new AppError(
      429,
      'QUOTA_EXCEEDED',
      `You've used this month's ${FREE_LOOKUPS_PER_MONTH} free lookups. For more, email hello@chainward.ai, or pay per call with no key at GET https://api.chainward.ai/api/risk/wallet?address=... over x402.`,
    );
  }
  let result: WalletLookup;
  try {
    result = await cachedLookup(address, chain as 'base' | 'bsc');
  } catch (err) {
    await redis.decr(quotaKey);
    throw err;
  }
  c.header('X-Quota-Limit', String(FREE_LOOKUPS_PER_MONTH));
  c.header('X-Quota-Remaining', String(Math.max(0, FREE_LOOKUPS_PER_MONTH - used)));
  return c.json({ success: true, data: result });
});

const walletPaid = new Hono();
walletPaid.get('/', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:wallet-x402' }), async (c: Context) => {
  const { address, chain } = parseCounterpartyInput(c.req.query('address'), c.req.query('chain'));
  return c.json({ success: true, data: await cachedLookup(address, chain as 'base' | 'bsc') });
});

export { walletV1, walletPaid };
