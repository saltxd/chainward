import type Redis from 'ioredis';
import { logger } from './logger.js';

// Runaway-wallet guard. Only transactions the monitored wallet SENDS count
// toward the limit, and a pause only ever suppresses INBOUND transfers:
//
//  - Counting inbound let anyone pause a wallet by sending it 11 dust
//    transfers, and the pause used to drop everything — so an attacker could
//    blind monitoring for 5 minutes and drain the wallet unobserved.
//  - Outbound transactions are never dropped, paused or not. They are what
//    a user is alerting on (drains, failed txs, gas spikes, new contracts).
//
// What a pause still buys: a wallet that's sending >10 txs/min gets flagged
// to its owner, and the inbound noise around it isn't indexed for 5 minutes.
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 10; // max outbound txs per window
const PAUSE_DURATION = 300; // 5 minutes

const COUNTER_PREFIX = 'rate:tx:';
const PAUSED_PREFIX = 'rate:paused:';

/**
 * Whether the monitored wallet is the sender. Only these count toward the
 * rate limit, and these are never skipped while paused. ('self' is a send.)
 */
export function isOutbound(direction: 'in' | 'out' | 'self'): boolean {
  return direction !== 'in';
}

/**
 * Check if an address is currently rate-limited (paused). Callers may skip
 * INBOUND transactions for a paused address; never outbound ones.
 */
export async function isAddressPaused(redis: Redis, address: string): Promise<boolean> {
  const key = `${PAUSED_PREFIX}${address.toLowerCase()}`;
  const paused = await redis.exists(key);
  return paused === 1;
}

/**
 * Record an OUTBOUND transaction for an address and check if it exceeds the
 * rate limit. Returns true if the address just got paused (caller should send
 * alert). Don't call this for inbound transfers — see the note at the top.
 */
export async function recordAndCheck(redis: Redis, address: string): Promise<boolean> {
  const addr = address.toLowerCase();
  const counterKey = `${COUNTER_PREFIX}${addr}`;
  const pausedKey = `${PAUSED_PREFIX}${addr}`;

  // Already paused — skip silently
  if (await redis.exists(pausedKey)) return false;

  // Atomically increment + set TTL on first insert via pipeline
  const pipeline = redis.pipeline();
  pipeline.incr(counterKey);
  pipeline.ttl(counterKey);
  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] as number) ?? 0;
  const ttl = (results?.[1]?.[1] as number) ?? -1;

  // Set expiry if this is a new key (ttl -1 = no expiry set)
  if (ttl === -1) {
    await redis.expire(counterKey, RATE_LIMIT_WINDOW);
  }

  if (count > RATE_LIMIT_MAX) {
    // Pause this address — pipeline the cleanup
    const pausePipeline = redis.pipeline();
    pausePipeline.setex(pausedKey, PAUSE_DURATION, '1');
    pausePipeline.del(counterKey);
    await pausePipeline.exec();

    logger.warn(
      { address: addr, txCount: count, pauseDuration: PAUSE_DURATION },
      'Address rate-limited — pausing inbound indexing for 5 minutes',
    );

    return true; // Just got paused — caller should notify user
  }

  return false;
}
