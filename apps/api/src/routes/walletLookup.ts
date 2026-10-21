import { Hono, type Context } from 'hono';
import { alchemyWalletLookupDeps, lookupWallet, sellerDemandRpcUrl, type WalletLookup } from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { labelsFor } from '../lib/labels.js';
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
// A lookup is about a second; a throttled RPC can retry for minutes. Past this the
// caller gets a 504 (an x402 payment is not settled on any error), and a lookup
// that finishes later still fills the cache.
const LOOKUP_BUDGET_MS = 10_000;
// Cache misses all free accounts may spend per UTC day: new accounts cost nothing
// to make (sign in with any wallet), so the per-account quota alone bounds nothing.
const freeDailyMisses = () => Number(process.env.WALLET_FREE_DAILY_LOOKUPS ?? 500);

/** The cached answer, or a fresh lookup; `beforeMiss` runs only when the cache has none. */
async function cachedLookup(address: string, chain: 'base' | 'bsc', beforeMiss?: () => Promise<void>): Promise<WalletLookup> {
  const redis = getRedis();
  // v3: lookups carry the decoy check; older entries (labels only, or neither) have none.
  const cacheKey = `wallet-lookup:v3:${chain}:${address}`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit) as WalletLookup;
  const rpcUrl = sellerDemandRpcUrl(chain, process.env);
  if (!rpcUrl) throw new AppError(503, 'LOOKUP_UNAVAILABLE', 'Wallet lookup is not configured for this chain');
  await beforeMiss?.();
  // The wallet's public labels from our investigations and detectors ride along (lib/labels.ts).
  const lookup = lookupWallet(address, chain, { ...alchemyWalletLookupDeps(rpcUrl), labelsFor }).then(async (result) => {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SEC);
    return result;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError(504, 'LOOKUP_TIMEOUT', 'The lookup did not finish in time. You were not charged; try again in a minute.')),
      LOOKUP_BUDGET_MS,
    );
  });
  try {
    return await Promise.race([lookup, budget]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Provider error text can name the provider and the plan; keep it in the logs.
    throw new AppError(503, 'SOURCES_UNAVAILABLE', 'The chain data source did not answer. You were not charged; try again in a minute.');
  } finally {
    clearTimeout(timer);
    lookup.catch(() => {});
  }
}

/** Spends one of today's free cache misses, or refuses with a pointer to the paid route. */
async function spendFreeMiss(): Promise<void> {
  const redis = getRedis();
  const key = `wallet-lookup:free-misses:${new Date().toISOString().slice(0, 10)}`;
  const spent = await redis.incr(key);
  if (spent === 1) await redis.expire(key, 2 * 86_400);
  if (spent > freeDailyMisses()) {
    await redis.decr(key);
    throw new AppError(
      429,
      'FREE_TIER_BUSY',
      'The free tier has used today\'s lookups. Try again tomorrow (UTC), or pay per call with no key at GET https://api.chainward.ai/api/risk/wallet?address=... over x402.',
    );
  }
}

const walletV1 = new Hono();
// By IP, ahead of the key check, so made-up keys cost nothing but a 429.
walletV1.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:wallet-v1-ip' }));
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
    result = await cachedLookup(address, chain as 'base' | 'bsc', spendFreeMiss);
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
