import { describe, it, expect } from 'vitest';
import { classifyUsdcPattern } from '../src/usdc-pattern.js';

describe('classifyUsdcPattern', () => {
  it('returns running for active wallet with low USDC', () => {
    expect(classifyUsdcPattern({ classification: 'active', usdc_balance: 6.42 })).toBe('running');
  });
  it('returns accumulating for active wallet with high USDC', () => {
    expect(classifyUsdcPattern({ classification: 'active', usdc_balance: 250 })).toBe('accumulating');
  });
  it('returns graveyard for dormant wallet with high USDC (the stranded-value finding)', () => {
    expect(classifyUsdcPattern({ classification: 'dormant', usdc_balance: 3658 })).toBe('graveyard');
  });
  it('returns inactive for dormant wallet with low USDC', () => {
    expect(classifyUsdcPattern({ classification: 'dormant', usdc_balance: 31 })).toBe('inactive');
  });
  it('returns unknown for unknown classification', () => {
    expect(classifyUsdcPattern({ classification: 'unknown', usdc_balance: 100 })).toBe('unknown');
  });
});
