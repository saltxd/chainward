import type Redis from 'ioredis';

export interface RateLimitConfig {
  maxConcurrentDecodes: number;
  perBuyerInflightLimit: number;
  perBuyerSubmissionLimit60s: number;
}

export class RateLimiter {
  private podConcurrent = 0;

  constructor(private redis: Redis, private config: RateLimitConfig) {}

  async tryAcquire(buyerWallet: string): Promise<'ok' | 'rate_limited'> {
    if (this.podConcurrent >= this.config.maxConcurrentDecodes) {
      return 'rate_limited';
    }
    const inflight = parseInt((await this.redis.get(`acp:inflight:${buyerWallet}`)) ?? '0', 10);
    if (inflight >= this.config.perBuyerInflightLimit) {
      return 'rate_limited';
    }
    const now = Date.now();
    const submissionsKey = `acp:submissions:${buyerWallet}`;
    await this.redis.zremrangebyscore(submissionsKey, '-inf', now - 60_000);
    const recent = await this.redis.zcard(submissionsKey);
    if (recent >= this.config.perBuyerSubmissionLimit60s) {
      return 'rate_limited';
    }
    await this.redis.zadd(submissionsKey, now, `${now}-${Math.random()}`);
    await this.redis.expire(submissionsKey, 120);
    await this.redis.incr(`acp:inflight:${buyerWallet}`);
    await this.redis.expire(`acp:inflight:${buyerWallet}`, 1800);
    this.podConcurrent++;
    return 'ok';
  }

  async release(buyerWallet: string): Promise<void> {
    const v = await this.redis.decr(`acp:inflight:${buyerWallet}`);
    if (v < 0) {
      await this.redis.incr(`acp:inflight:${buyerWallet}`); // floor at 0
    }
    this.podConcurrent = Math.max(0, this.podConcurrent - 1);
  }
}
