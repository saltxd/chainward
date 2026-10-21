import { Hono, type Context } from 'hono';
import { alchemyTokenCheckDeps, checkToken, sellerDemandRpcUrl, type CheckTokenOptions, type TokenCheck } from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { labelsFor, recordSerialLauncher } from '../lib/labels.js';
import { logger } from '../lib/logger.js';
import { parseTokenInput } from '../lib/paidInput.js';
import { budget, rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Token check (rug check) ──────────────────────────────────────────────────
//
// GET /api/risk/rugcheck?token= (and the plain-named alias GET /api/risk/token?address=),
// paid per call over x402 (app.ts mounts the payment middleware): who launched a Base
// token, how, and what the launch wallet and the supply did afterwards, with a verdict.
// GET /api/risk/token-report/:address is the same check, free, for the report page on
// chainward.ai, where people paste a token; both share one cache.

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

const sharedKey = (token: string) => `token-check:v3:base:${token}`;

async function readCache(key: string): Promise<TokenCheck | null> {
  const hit = await getRedis().get(key);
  return hit ? (JSON.parse(hit) as TokenCheck) : null;
}

// One run per token at a time in this process: a request for a token already being checked
// waits for that run instead of reading the chain again. The paid and free routes never share
// a run, so a free run refused by its allowance cannot fail a buyer who paid.
// A run older than STALE_RUN_MS is not joined (its reads have their own timeouts, so a run
// that old is stuck): the next request starts a fresh one.
const running = new Map<string, { started: number; check: Promise<TokenCheck> }>();
const STALE_RUN_MS = 60_000;

function runCheck(token: string, route: 'paid' | 'free', opts: CheckTokenOptions = {}): Promise<TokenCheck> {
  const key = `${route}:${token}`;
  const already = running.get(key);
  if (already && Date.now() - already.started < STALE_RUN_MS) return already.check;
  const rpcUrl = sellerDemandRpcUrl('base', process.env);
  if (!rpcUrl) return Promise.reject(new AppError(503, 'CHECK_UNAVAILABLE', 'The token check is not configured'));
  const check = checkToken(token, { ...alchemyTokenCheckDeps(rpcUrl), labelsFor }, opts)
    .then(async (result) => {
      await getRedis().set(sharedKey(token), JSON.stringify(result), 'EX', ttlFor(result));
      // The check as a detector: a serial launch labels its launch wallet (public, 30 days).
      recordSerialLauncher(result).catch((err) => logger.warn({ err, token }, 'labels: could not record a serial launcher'));
      return result;
    })
    .finally(() => {
      if (running.get(key)?.check === check) running.delete(key);
    });
  running.set(key, { started: Date.now(), check });
  return check;
}

/** The run within its time budget: 504 past it (the run goes on and fills the cache), 503 when the chain source fails. */
async function withinBudget(token: string, check: Promise<TokenCheck>): Promise<TokenCheck> {
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

async function cachedCheck(token: string): Promise<TokenCheck> {
  return (await readCache(sharedKey(token))) ?? withinBudget(token, runCheck(token, 'paid'));
}

const tokenCheck = new Hono();
tokenCheck.get('/', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:token-check-x402' }), async (c: Context) => {
  const { token } = parseTokenInput(tokenParam(c), c.req.query('chain'));
  return c.json({ success: true, data: await cachedCheck(token) });
});

// The free check for people, on the same provider plan the paid checks use, so three allowances
// bound what it can spend:
// - every uncached address costs a few reads before the check knows whether it is a token:
//   everyone shares a daily cap on those (past it the page shows the wallet report instead);
// - a fresh check of an actual token makes some forty more: each visitor gets an hourly
//   allowance and everyone shares a daily one (the hook runs once the address is a token);
// - a token re-read within ten minutes of its last charge is not charged again (the paid
//   check re-reads a token in its first two hours every minute), and the free answer for such
//   a token is kept three minutes.
// A cached answer spends nothing. Past the token allowances the paid check still answers.
export const FREE_PROBES_PER_DAY = 2_000;
export const FREE_TOKEN_CHECKS_PER_HOUR = 20;
export const FREE_TOKEN_CHECKS_PER_DAY = 200;
const CHARGED_FOR_SEC = 600;
const FREE_YOUNG_TTL_SEC = 180;
const freeProbes = budget({ max: FREE_PROBES_PER_DAY, windowSec: 86_400, prefix: 'bud:token-probe-day', scope: 'global' });
const freeHourly = budget({ max: FREE_TOKEN_CHECKS_PER_HOUR, windowSec: 3_600, prefix: 'bud:token-report' });
const freeDaily = budget({ max: FREE_TOKEN_CHECKS_PER_DAY, windowSec: 86_400, prefix: 'bud:token-report-day', scope: 'global' });
const recentKey = (token: string) => `token-report:recent:${token}`;
const chargedKey = (token: string) => `token-report:charged:${token}`;
const PAID_CHECK = 'use the paid check: GET https://api.chainward.ai/api/risk/rugcheck?address=… ($0.02 over x402).';
const FREE_USED_UP = `Today's free rug checks are used up. Try again tomorrow, or ${PAID_CHECK}`;
const FREE_HOURLY_USED_UP = `You have used this hour's free rug checks. Try again later, or ${PAID_CHECK}`;
const PROBES_USED_UP = 'The free check is busy. Try again later.';

/** Spends one unit, or answers 429 with this route's own code and words. */
async function spendOr(allowance: ReturnType<typeof budget>, c: Context, code: string, message: string): Promise<() => Promise<void>> {
  try {
    return await allowance.spend(c);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 429) throw new AppError(429, code, message);
    throw err;
  }
}

/** Charges a fresh check of a token to the visitor and the day; what it charged goes on `giveBack`. */
async function chargeFreeCheck(c: Context, token: string, giveBack: Array<() => Promise<void>>): Promise<void> {
  const redis = getRedis();
  if (await redis.get(chargedKey(token))) return;
  const hourly = await spendOr(freeHourly, c, 'FREE_HOURLY_LIMIT', FREE_HOURLY_USED_UP);
  let daily: () => Promise<void>;
  try {
    daily = await spendOr(freeDaily, c, 'FREE_CHECKS_USED_UP', FREE_USED_UP);
  } catch (err) {
    await hourly();
    throw err;
  }
  await redis.set(chargedKey(token), '1', 'EX', CHARGED_FOR_SEC);
  giveBack.push(hourly, daily, async () => {
    await redis.del(chargedKey(token));
  });
}

const tokenReport = new Hono();
tokenReport.get('/:address', rateLimit({ max: 30, windowSec: 60, prefix: 'rl:token-report' }), async (c: Context) => {
  const { token } = parseTokenInput(c.req.param('address'), 'base');
  const hit = (await readCache(sharedKey(token))) ?? (await readCache(recentKey(token)));
  if (hit) return c.json({ success: true, data: hit });
  // ?cached=1: the report page's server render, for the link preview; it never reads the chain.
  if (c.req.query('cached') === '1') throw new AppError(404, 'NOT_FOUND', 'No recent check for this address');
  await spendOr(freeProbes, c, 'PROBES_USED_UP', PROBES_USED_UP);
  const giveBack: Array<() => Promise<void>> = [];
  try {
    const data = await withinBudget(token, runCheck(token, 'free', { beforeLaunchSearch: () => chargeFreeCheck(c, token, giveBack) }));
    await getRedis().set(recentKey(token), JSON.stringify(data), 'EX', ttlFor(data) === YOUNG_TOKEN_TTL_SEC ? FREE_YOUNG_TTL_SEC : CACHE_TTL_SEC);
    return c.json({ success: true, data });
  } catch (err) {
    // A check past its time budget keeps running and fills the cache, so it keeps what it was charged.
    if (err instanceof AppError && err.code === 'SOURCES_UNAVAILABLE') await Promise.all(giveBack.map((give) => give()));
    throw err;
  }
});

export { tokenCheck, tokenReport };
