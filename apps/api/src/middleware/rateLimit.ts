import { isIPv4, isIPv6 } from 'node:net';
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

interface BudgetOptions extends RateLimitOptions {
  /** 'client' (default): one allowance per client. 'global': one allowance shared by every caller. */
  scope?: 'client' | 'global';
}

/** In-cluster callers (the web server's own SSR/OG fetches) get this many times the limit. */
const INTERNAL_MULTIPLIER = 10;

/** The eight 16-bit groups of a valid IPv6 address. */
function ipv6Groups(ip: string): number[] {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // A trailing dotted IPv4 (e.g. ::ffff:203.0.113.7) is the last two groups.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number);
    s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', rest] = s.split('::');
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const fill = rest === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16));
}

/**
 * The address a client is counted as. One IPv6 client usually holds a whole /64,
 * so keying on its full address handed it 2^64 buckets: IPv6 counts per /64, and
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) as the IPv4 address. Anything that isn't an
 * IP is kept as it is.
 */
export function clientIpBucket(raw: string): string {
  const ip = raw.trim();
  if (isIPv4(ip) || !isIPv6(ip)) return ip;
  const g = ipv6Groups(ip);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const [hi = 0, lo = 0] = g.slice(6);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
}

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
  if (cfIp) return { id: `ip:${clientIpBucket(cfIp)}`, internal: false };

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

/**
 * A per-client allowance the handler spends explicitly, for a cost only some
 * requests incur (e.g. enqueuing a fresh decode). Same sliding window, identity
 * and internal multiplier as rateLimit(); nothing is counted until spend().
 * With scope 'global', one allowance is shared by every caller.
 */
export function budget(options: BudgetOptions) {
  const { windowSec, prefix = 'rl', scope = 'client' } = options;

  function bucket(c: Context): { key: string; max: number } {
    if (scope === 'global') return { key: `${prefix}:global`, max: options.max };
    const identity = clientIdentity(c);
    return {
      key: `${prefix}:${identity.id}`,
      max: identity.internal ? options.max * INTERNAL_MULTIPLIER : options.max,
    };
  }

  function exhausted(): AppError {
    return new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  return {
    /** 429 if this client has nothing left in the window. Spends nothing. */
    async ensureAvailable(c: Context): Promise<void> {
      const { key, max } = bucket(c);
      const results = await getRedis()
        .pipeline()
        .zremrangebyscore(key, 0, Date.now() - windowSec * 1000)
        .zcard(key)
        .exec();
      if (((results?.[1]?.[1] as number) ?? 0) >= max) throw exhausted();
    },

    /**
     * Spends one unit, or answers 429 (spending nothing) if none is left.
     * Resolves to a refund, for when a later check refuses the request.
     */
    async spend(c: Context): Promise<() => Promise<void>> {
      const { key, max } = bucket(c);
      const redis = getRedis();
      const now = Date.now();
      const member = `${now}:${Math.random()}`;
      const results = await redis
        .pipeline()
        .zremrangebyscore(key, 0, now - windowSec * 1000)
        .zcard(key)
        .zadd(key, now, member)
        .expire(key, windowSec)
        .exec();
      const refund = async () => {
        await redis.zrem(key, member);
      };
      if (((results?.[1]?.[1] as number) ?? 0) >= max) {
        await refund();
        throw exhausted();
      }
      return refund;
    },
  };
}
