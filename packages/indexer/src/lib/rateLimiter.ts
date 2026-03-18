import type Redis from 'ioredis';
import { logger } from './logger.js';

const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 10; // max txs per window
const PAUSE_DURATION = 300; // 5 minutes

const COUNTER_PREFIX = 'rate:tx:';
const PAUSED_PREFIX = 'rate:paused:';

/**
 * Check if an address is currently rate-limited (paused).
 * Returns true if the address should be skipped.
 */
export async function isAddressPaused(redis: Redis, address: string): Promise<boolean> {
  const key = `${PAUSED_PREFIX}${address.toLowerCase()}`;
  const paused = await redis.exists(key);
  return paused === 1;
}

/**
 * Record a transaction for an address and check if it exceeds the rate limit.
 * Returns true if the address just got paused (caller should send alert).
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
      'Address rate-limited — pausing indexing for 5 minutes',
    );

    return true; // Just got paused — caller should notify user
  }

  return false;
}
