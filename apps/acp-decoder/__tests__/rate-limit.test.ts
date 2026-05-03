import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rate-limit.js';

class MockRedis {
  store = new Map<string, number>();
  zsets = new Map<string, number[]>();
  async incr(k: string) { const v = (this.store.get(k) ?? 0) + 1; this.store.set(k, v); return v; }
  async decr(k: string) { const v = (this.store.get(k) ?? 0) - 1; this.store.set(k, v); return v; }
  async get(k: string) { return this.store.get(k)?.toString() ?? null; }
  async expire(_k: string, _s: number) { return 1; }
  async zadd(k: string, _score: number, _member: string) {
    const arr = this.zsets.get(k) ?? []; arr.push(Date.now()); this.zsets.set(k, arr); return 1;
  }
  async zremrangebyscore(k: string, _min: string, max: number) {
    const arr = this.zsets.get(k) ?? []; const kept = arr.filter((t) => t > max); this.zsets.set(k, kept); return arr.length - kept.length;
  }
  async zcard(k: string) { return this.zsets.get(k)?.length ?? 0; }
}

describe('RateLimiter', () => {
  it('allows submissions under the per-buyer in-flight limit', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 3, perBuyerInflightLimit: 3, perBuyerSubmissionLimit60s: 5 });
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('rate_limited');
  });
  it('releases in-flight slot on release()', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 3, perBuyerInflightLimit: 1, perBuyerSubmissionLimit60s: 5 });
    expect(await rl.tryAcquire('b')).toBe('ok');
    expect(await rl.tryAcquire('b')).toBe('rate_limited');
    await rl.release('b');
    expect(await rl.tryAcquire('b')).toBe('ok');
  });
  it('enforces per-pod max concurrency', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 2, perBuyerInflightLimit: 99, perBuyerSubmissionLimit60s: 99 });
    expect(await rl.tryAcquire('b1')).toBe('ok');
    expect(await rl.tryAcquire('b2')).toBe('ok');
    expect(await rl.tryAcquire('b3')).toBe('rate_limited');
  });
});
