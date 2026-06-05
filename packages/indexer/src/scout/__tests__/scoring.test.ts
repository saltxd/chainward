import { describe, it, expect } from 'vitest';
import { scoreCandidate, type AgentRow } from '../scoring.js';

const base: AgentRow = {
  acpId: 1, name: 'Boring Agent', walletAddress: '0x' + '1'.repeat(40),
  twitterHandle: null, grossAgenticAmount: 2000, revenue: 1500,
  uniqueBuyerCount: 5, transactionCount: 10, walletBalance: '1500',
  successfulJobCount: 10, lastActiveAt: new Date().toISOString(),
};

describe('scoreCandidate — aGDP/revenue gap (NULL-safe)', () => {
  it('flags the Wasabot pattern: high aGDP, NULL revenue → unmeasurable bucket, high juice', () => {
    const r = scoreCandidate({ ...base, name: 'Wasabot', grossAgenticAmount: 81_000_000, revenue: null, uniqueBuyerCount: 400 });
    expect(r.gapBucket).toBe('unmeasurable');
    expect(r.anomaly).toBeGreaterThan(0.5);
    expect(r.juice).toBeGreaterThan(0);
  });

  it('computes a finite ratio when revenue is present and < aGDP', () => {
    const r = scoreCandidate({ ...base, name: 'Gapper', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 200 });
    expect(r.gapBucket).toBe('measured');
    expect(r.ratio).toBeCloseTo(200, 0);
    expect(r.anomaly).toBeGreaterThan(0.5);
  });

  it('clamps data-artifact rows where revenue > aGDP (ratio < 1) to non-anomaly', () => {
    const r = scoreCandidate({ ...base, grossAgenticAmount: 1000, revenue: 9999 });
    expect(r.anomaly).toBe(0);
  });

  it('floors out micro-agents below $5k aGDP (no phantom gaps)', () => {
    const r = scoreCandidate({ ...base, grossAgenticAmount: 490, revenue: 1, uniqueBuyerCount: 0 });
    expect(r.belowFloor).toBe(true);
    expect(r.juice).toBe(0);
  });

  it('flags the 99,999,999.99 aGDP cap as a data flag', () => {
    const r = scoreCandidate({ ...base, name: 'Capped', grossAgenticAmount: 99_999_999.99, revenue: null });
    expect(r.capFlag).toBe(true);
  });

  it('reach uses unique_buyer_count; juice = anomaly * reach, higher buyers → higher juice', () => {
    const lo = scoreCandidate({ ...base, name: 'Lo', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 10 });
    const hi = scoreCandidate({ ...base, name: 'Hi', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 1000 });
    expect(hi.juice).toBeGreaterThan(lo.juice);
  });

  it('treats NEGATIVE revenue as unmeasurable (no NaN)', () => {
    const r = scoreCandidate({ ...base, name: 'Refunded', grossAgenticAmount: 1_000_000, revenue: -50, uniqueBuyerCount: 100 });
    expect(r.gapBucket).toBe('unmeasurable');
    expect(Number.isNaN(r.anomaly)).toBe(false);
    expect(Number.isNaN(r.juice)).toBe(false);
    expect(r.juice).toBeGreaterThan(0);
  });

  it('explicit revenue: 0 behaves like null (unmeasurable)', () => {
    const r = scoreCandidate({ ...base, name: 'ZeroRev', grossAgenticAmount: 1_000_000, revenue: 0, uniqueBuyerCount: 100 });
    expect(r.gapBucket).toBe('unmeasurable');
  });

  it('null grossAgenticAmount floors out (treated as 0)', () => {
    const r = scoreCandidate({ ...base, grossAgenticAmount: null, revenue: 1000 });
    expect(r.belowFloor).toBe(true);
    expect(r.juice).toBe(0);
  });

  it('null uniqueBuyerCount on a scoreable row → reach 0, no NaN', () => {
    const r = scoreCandidate({ ...base, name: 'NoBuyers', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: null });
    expect(r.reach).toBe(0);
    expect(Number.isNaN(r.juice)).toBe(false);
  });
});
