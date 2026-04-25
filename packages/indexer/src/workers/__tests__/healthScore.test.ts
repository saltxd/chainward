import { describe, it, expect } from 'vitest';
import { computeHealthScore } from '../healthScore.js';

describe('computeHealthScore', () => {
  it('returns max score for a perfect agent', () => {
    const result = computeHealthScore({
      uptimePct: 100,
      failureRate: 0,
      gasEfficiency: 100,
      consistency: 100,
    });
    expect(result).toBe(100);
  });

  it('returns 0 for a totally broken agent', () => {
    const result = computeHealthScore({
      uptimePct: 0,
      failureRate: 100,
      gasEfficiency: 0,
      consistency: 0,
    });
    expect(result).toBe(0);
  });

  it('weights uptime at 30%', () => {
    expect(
      computeHealthScore({ uptimePct: 100, failureRate: 100, gasEfficiency: 0, consistency: 0 }),
    ).toBe(30);
  });

  it('weights failure-rate inverse at 25%', () => {
    expect(
      computeHealthScore({ uptimePct: 0, failureRate: 0, gasEfficiency: 0, consistency: 0 }),
    ).toBe(25);
  });

  it('clamps inputs into [0, 100]', () => {
    // uptimePct=150→100, failureRate=-10→0, gasEfficiency=200→100, consistency=50
    // 0.30*100 + 0.25*(100-0) + 0.25*100 + 0.20*50 = 30+25+25+10 = 90
    expect(
      computeHealthScore({ uptimePct: 150, failureRate: -10, gasEfficiency: 200, consistency: 50 }),
    ).toBe(90);
  });

  it('rounds to nearest integer', () => {
    expect(
      computeHealthScore({
        uptimePct: 34,
        failureRate: 66,
        gasEfficiency: 34,
        consistency: 34,
      }),
    ).toBe(34);
  });
});
