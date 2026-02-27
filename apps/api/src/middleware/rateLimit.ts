import type { Context, Next } from 'hono';
import { getRedis } from '../lib/redis.js';
import { AppError } from './errorHandler.js';

interface RateLimitOptions {
  /** Max requests in the window */
  max: number;
  /** Window size in seconds */
  windowSec: number;
  /** Key prefix for Redis */
  prefix?: string;
}

/**
 * Redis-backed sliding window rate limiter.
 * Uses a sorted set with timestamps for precise windowing.
 */
export function rateLimit(options: RateLimitOptions) {
  const { max, windowSec, prefix = 'rl' } = options;

  return async (c: Context, next: Next) => {
    const redis = getRedis();

    // Identify the client: API key prefix, user ID, or IP
    const authHeader = c.req.header('Authorization');
    let identifier: string;

    if (authHeader?.startsWith('Bearer ag_')) {
      identifier = authHeader.slice('Bearer '.length, 'Bearer '.length + 11); // ag_ + first 8
    } else {
      const user = c.get('user' as never) as { id: string } | undefined;
      identifier = user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous';
    }

    const key = `${prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    // Use a pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    pipeline.expire(key, windowSec);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - currentCount - 1)));
    c.header('X-RateLimit-Reset', String(Math.ceil((now + windowSec * 1000) / 1000)));

    if (currentCount >= max) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }

    await next();
  };
}
