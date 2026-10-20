import { Hono, type Context } from 'hono';
import { alchemyTokenCheckDeps, checkToken, sellerDemandRpcUrl, type TokenCheck } from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { parseTokenInput } from '../lib/paidInput.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Token check (rug check) ──────────────────────────────────────────────────
//
// GET /api/risk/rugcheck?token= (and the plain-named alias GET /api/risk/token?address=),
// paid per call over x402 (app.ts mounts the payment middleware): who launched a Base
// token, how, and what the launch wallet and the supply did afterwards, with a verdict.

const CACHE_TTL_SEC = 600;
// In a token's first hours the launch-hour send-out can change within minutes: re-read it sooner.
const YOUNG_TOKEN_TTL_SEC = 60;
const YOUNG_TOKEN_MS = 2 * 3_600_000;
const ttlFor = (r: TokenCheck) => {
  const launched = r.launch?.time ? Date.parse(r.launch.time) : Number.NaN;
  return Number.isFinite(launched) && Date.now() - launched < YOUNG_TOKEN_MS ? YOUNG_TOKEN_TTL_SEC : CACHE_TTL_SEC;
};
// A check takes one to five seconds; a launch found by searching blocks, or a throttled
// RPC, takes longer. Past this the caller gets a 504 (an x402 payment is not settled on
// any error), and a check that finishes later still fills the cache.
const CHECK_BUDGET_MS = 15_000;

/** The token: ?token=, or ?address= for clients that always send that name. */
export const tokenParam = (c: Context): string | undefined => c.req.query('token') ?? c.req.query('address');

async function cachedCheck(token: string): Promise<TokenCheck> {
  const redis = getRedis();
  const cacheKey = `token-check:v1:base:${token}`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit) as TokenCheck;
  const rpcUrl = sellerDemandRpcUrl('base', process.env);
  if (!rpcUrl) throw new AppError(503, 'CHECK_UNAVAILABLE', 'The token check is not configured');
  const check = checkToken(token, alchemyTokenCheckDeps(rpcUrl)).then(async (result) => {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', ttlFor(result));
    return result;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError(504, 'CHECK_TIMEOUT', 'The check did not finish in time. You were not charged; try again in a minute.')),
      CHECK_BUDGET_MS,
    );
  });
  try {
    return await Promise.race([check, budget]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Provider error text can name the provider and the plan: the logs get it, the caller does not.
    logger.warn({ err, token }, 'token check: chain source failed');
    throw new AppError(503, 'SOURCES_UNAVAILABLE', 'The chain data source did not answer. You were not charged; try again in a minute.');
  } finally {
    clearTimeout(timer);
    check.catch(() => {});
  }
}

const tokenCheck = new Hono();
tokenCheck.get('/', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:token-check-x402' }), async (c: Context) => {
  const { token } = parseTokenInput(tokenParam(c), c.req.query('chain'));
  return c.json({ success: true, data: await cachedCheck(token) });
});

export { tokenCheck };
