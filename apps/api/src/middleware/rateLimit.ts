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

/** In-cluster callers (the web server's own SSR/OG fetches) get this many times the limit. */
const INTERNAL_MULTIPLIER = 10;

/**
 * Who the request counts against.
 *
 * Never keyed on an unvalidated credential: a `Bearer ag_<anything>` header used
 * to open a fresh bucket per made-up key. Authenticated routes that already ran
 * auth middleware key on the user; everything else keys on the client IP that
 * Cloudflare sets in CF-Connecting-IP (it overwrites any client-sent value).
 *
 * Requests without CF-Connecting-IP never came through Cloudflare, so they are
 * in-cluster or LAN callers. They share an internal bucket per forwarded IP with
 * a higher limit, instead of one 'anonymous' bucket any visitor could exhaust
 * by making the web server fetch on their behalf.
 */
export function clientIdentity(c: Context): { id: string; internal: boolean } {
  const user = c.get('user' as never) as { id: string } | undefined;
  if (user?.id) return { id: `user:${user.id}`, internal: false };

  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return { id: `ip:${cfIp}`, internal: false };

  const xffIp = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
  return { id: `internal:${xffIp || 'cluster'}`, internal: true };
}

/**
 * Redis-backed sliding window rate limiter.
 * Uses a sorted set with timestamps for precise windowing.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowSec, prefix = 'rl' } = options;

  return async (c: Context, next: Next) => {
    const redis = getRedis();

    const identity = clientIdentity(c);
    const max = identity.internal ? options.max * INTERNAL_MULTIPLIER : options.max;
    const key = `${prefix}:${identity.id}`;
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
