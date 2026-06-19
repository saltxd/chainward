import { describe, it, expect } from 'vitest';
import { formatUsd, formatCompact, formatTokenAmount, formatGwei } from '../utils/format.js';

describe('formatUsd', () => {
  it('uses 6 decimals for sub-cent values', () => {
    expect(formatUsd(0.005)).toBe('$0.005000');
    expect(formatUsd(0)).toBe('$0.000000');
  });

  it('uses 4 decimals between a cent and a dollar', () => {
    expect(formatUsd(0.5)).toBe('$0.5000');
  });

  it('uses currency formatting at/above a dollar', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(1)).toBe('$1.00');
  });
});

describe('formatCompact', () => {
  it('adds K/M suffixes', () => {
    expect(formatCompact(1500)).toBe('1.5K');
    expect(formatCompact(2_000_000)).toBe('2M');
  });

  it('leaves small numbers alone', () => {
    expect(formatCompact(950)).toBe('950');
  });
});

describe('formatTokenAmount', () => {
  it('returns "0" for a zero balance', () => {
    expect(formatTokenAmount('0', 18)).toBe('0');
  });

  it('clamps dust below the precision floor', () => {
    expect(formatTokenAmount('1', 18)).toBe('<0.000001');
  });

  it('strips trailing zeros after the decimal point', () => {
    expect(formatTokenAmount('1500000', 6)).toBe('1.5');
    expect(formatTokenAmount('1000000', 6)).toBe('1');
    expect(formatTokenAmount('1234567', 6)).toBe('1.234567');
  });

  it('preserves trailing zeros of integer (0-decimal) amounts', () => {
    expect(formatTokenAmount('100', 0)).toBe('100');
    expect(formatTokenAmount('10', 0)).toBe('10');
    expect(formatTokenAmount('1200', 0)).toBe('1200');
  });
});

describe('formatGwei', () => {
  it('clamps near-zero gas', () => {
    expect(formatGwei(0.005)).toBe('<0.01 gwei');
  });

  it('formats with two decimals', () => {
    expect(formatGwei(25.5)).toBe('25.50 gwei');
    expect(formatGwei(0.01)).toBe('0.01 gwei');
  });
});
