import { Hono, type Context } from 'hono';
import { alchemyTokenCheckDeps, checkToken, sellerDemandRpcUrl, type CheckTokenOptions, type TokenCheck } from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { labelsFor, recordSerialLauncher } from '../lib/labels.js';
import { logger } from '../lib/logger.js';
import { parseTokenInput } from '../lib/paidInput.js';
import { notATokenError, rememberKind, requireToken, type NotATokenFlag } from '../lib/tokenKind.js';
import { budget, rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Token check (rug check) ──────────────────────────────────────────────────
//
// GET /api/risk/rugcheck?token= (and the plain-named alias GET /api/risk/token?address=),
// paid per call over x402 (app.ts mounts the payment middleware): who launched a Base
// token, how, and what the launch wallet and the supply did afterwards, with a verdict.
// GET /api/risk/token-report/:address is the same check, free, for the report page on
// chainward.ai, where people paste a token; both share one cache. Every answer says when it
// was read (checked_at), whether it came from the cache (cached) and how old it is (age_seconds).

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
// When to ask again after a 503 or a 504: the source has had a minute, or the finished answer is cached.
const RETRY_AFTER = { 'Retry-After': '60' };

/** The token: ?token=, or ?address= for clients that always send that name. */
export const tokenParam = (c: Context): string | undefined => c.req.query('token') ?? c.req.query('address');

/**
 * The paid routes' input check, ahead of the payment middleware: a token on Base, or a 400
 * (NOT_A_TOKEN for an address that is not a token), so nobody signs a payment for that.
 */
export async function parsePaidTokenInput(c: Context): Promise<void> {
  const { token } = parseTokenInput(tokenParam(c), c.req.query('chain'));
  await requireToken(c, token);
}

// v4: the cached check carries checked_at.
const sharedKey = (token: string) => `token-check:v6:base:${token}`;

/** A check as the cache keeps it: the answer, and when it was read. */
type StoredCheck = TokenCheck & { checked_at: string };

async function readCache(key: string): Promise<StoredCheck | null> {
  const hit = await getRedis().get(key);
  return hit ? (JSON.parse(hit) as StoredCheck) : null;
}

/**
 * The answer as sent, with whether it came from the cache and its age in seconds, so a caller
 * can tell a cached answer from a fresh one. Fields are only added: outside agents, the MCP
 * server and the report page read the rest.
 */
const answer = (check: StoredCheck, cached: boolean) => ({
  ...check,
  cached,
  age_seconds: Math.max(0, Math.floor((Date.now() - Date.parse(check.checked_at)) / 1000)),
});

// One run per token at a time in this process: a request for a token already being checked
// waits for that run instead of reading the chain again. The paid and free routes never share
// a run, so a free run refused by its allowance cannot fail a buyer who paid.
// A run older than STALE_RUN_MS is not joined (its reads have their own timeouts, so a run
// that old is stuck): the next request starts a fresh one.
const running = new Map<string, { started: number; check: Promise<StoredCheck> }>();
const STALE_RUN_MS = 60_000;

function runCheck(token: string, route: 'paid' | 'free', opts: CheckTokenOptions = {}): Promise<StoredCheck> {
  const key = `${route}:${token}`;
  const already = running.get(key);
  if (already && Date.now() - already.started < STALE_RUN_MS) return already.check;
  const rpcUrl = sellerDemandRpcUrl('base', process.env);
  if (!rpcUrl) return Promise.reject(new AppError(503, 'CHECK_UNAVAILABLE', 'The token check is not configured'));
  const check = checkToken(token, { ...alchemyTokenCheckDeps(rpcUrl), labelsFor }, opts)
    .then(async (result) => {
      const stored: StoredCheck = { ...result, checked_at: new Date().toISOString() };
      await getRedis().set(sharedKey(token), JSON.stringify(stored), 'EX', ttlFor(result));
      // The check as a detector: a serial launch labels its launch wallet (public, 30 days).
      recordSerialLauncher(result).catch((err) => logger.warn({ err, token }, 'labels: could not record a serial launcher'));
      return stored;
    })
    .finally(() => {
      if (running.get(key)?.check === check) running.delete(key);
    });
  running.set(key, { started: Date.now(), check });
  return check;
}

/** The run within its time budget: 504 past it (the run goes on and fills the cache), 503 when the chain source fails. */
async function withinBudget(token: string, check: Promise<StoredCheck>): Promise<StoredCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError(504, 'CHECK_TIMEOUT', 'The check did not finish in time. You were not charged; try again in a minute.', undefined, RETRY_AFTER)),
      CHECK_BUDGET_MS,
    );
  });
  try {
    return await Promise.race([check, budget]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Provider error text can name the provider and the plan: the logs get it, the caller does not.
    logger.warn({ err, token }, 'token check: chain source failed');
    throw new AppError(503, 'SOURCES_UNAVAILABLE', 'The chain data source did not answer. You were not charged; try again in a minute.', undefined, RETRY_AFTER);
  } finally {
    clearTimeout(timer);
    check.catch(() => {});
  }
}

async function paidCheck(token: string): Promise<{ check: StoredCheck; cached: boolean }> {
  const hit = await readCache(sharedKey(token));
  return hit ? { check: hit, cached: true } : { check: await withinBudget(token, runCheck(token, 'paid')), cached: false };
}

const NOT_A_TOKEN_FLAGS: NotATokenFlag[] = ['not_a_contract', 'not_a_token'];

/**
 * A check that found no token is refused with 400, so the payment middleware settles nothing:
 * an NFT collection answers totalSupply() and passes the read before payment, and so does any
 * address when that read could not run. A look-alike's hold is an answer, and is sent.
 */
async function refuseNotAToken(token: string, check: TokenCheck): Promise<void> {
  if (check.flags.includes('imitates_known_token')) return;
  const flag = NOT_A_TOKEN_FLAGS.find((f) => check.flags.includes(f));
  if (!flag) return;
  // Refused before payment from now on.
  await rememberKind(token, flag).catch((err) => logger.warn({ err, token }, 'token kind: could not keep a non-token'));
  throw notATokenError(flag, check.verdict.reason);
}

const tokenCheck = new Hono();
tokenCheck.get('/', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:token-check-x402' }), async (c: Context) => {
  const { token } = parseTokenInput(tokenParam(c), c.req.query('chain'));
  const { check, cached } = await paidCheck(token);
  await refuseNotAToken(token, check);
  return c.json({ success: true, data: answer(check, cached) });
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
// v2: the cached check carries checked_at.
const recentKey = (token: string) => `token-report:v4:recent:${token}`;
const chargedKey = (token: string) => `token-report:charged:${token}`;
const PAID_CHECK = 'use the paid check: GET https://api.chainward.ai/api/risk/rugcheck?address=… ($0.02 over x402).';
const FREE_USED_UP = `Today's free rug checks are used up. Try again tomorrow, or ${PAID_CHECK}`;
const FREE_HOURLY_USED_UP = `You have used this hour's free rug checks. Try again later, or ${PAID_CHECK}`;
const PROBES_USED_UP = 'The free check is busy. Try again later.';

/**
 * Spends one unit, or answers 429 with this route's own code and words, and headers for the
 * allowance that refused it: its limit, and Retry-After until its next unit frees.
 */
async function spendOr(allowance: ReturnType<typeof budget>, c: Context, code: string, message: string): Promise<() => Promise<void>> {
  try {
    return await allowance.spend(c);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 429) throw new AppError(429, code, message, undefined, await allowance.refusalHeaders(c));
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
  if (hit) return c.json({ success: true, data: answer(hit, true) });
  // ?cached=1: the report page's server render, for the link preview; it never reads the chain.
  if (c.req.query('cached') === '1') throw new AppError(404, 'NOT_FOUND', 'No recent check for this address');
  await spendOr(freeProbes, c, 'PROBES_USED_UP', PROBES_USED_UP);
  const giveBack: Array<() => Promise<void>> = [];
  try {
    const data = await withinBudget(token, runCheck(token, 'free', { beforeLaunchSearch: () => chargeFreeCheck(c, token, giveBack) }));
    await getRedis().set(recentKey(token), JSON.stringify(data), 'EX', ttlFor(data) === YOUNG_TOKEN_TTL_SEC ? FREE_YOUNG_TTL_SEC : CACHE_TTL_SEC);
    return c.json({ success: true, data: answer(data, false) });
  } catch (err) {
    // A check past its time budget keeps running and fills the cache, so it keeps what it was charged.
    if (err instanceof AppError && err.code === 'SOURCES_UNAVAILABLE') await Promise.all(giveBack.map((give) => give()));
    throw err;
  }
});

export { tokenCheck, tokenReport };
