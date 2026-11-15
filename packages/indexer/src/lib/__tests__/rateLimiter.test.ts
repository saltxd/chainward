import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { countsTowardRateLimit, isOutbound } from '../rateLimiter.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

describe('countsTowardRateLimit', () => {
  it('counts what the wallet sent: ETH, tokens, a send to itself', () => {
    expect(countsTowardRateLimit({ direction: 'out', tokenAddress: null, amountRaw: '250000000000000000' })).toBe(true);
    expect(countsTowardRateLimit({ direction: 'out', tokenAddress: USDC, amountRaw: '12500000' })).toBe(true);
    expect(countsTowardRateLimit({ direction: 'self', tokenAddress: null, amountRaw: '1' })).toBe(true);
  });

  it('does not count what came in', () => {
    expect(countsTowardRateLimit({ direction: 'in', tokenAddress: USDC, amountRaw: '12500000' })).toBe(false);
  });

  // An approval, a claim or a reverted call moved nothing. It stays outbound
  // (never skipped while paused) but does not count toward a pause.
  it('does not count a contract call row (no token, zero amount)', () => {
    const call = { direction: 'out' as const, tokenAddress: null, amountRaw: '0' };
    expect(countsTowardRateLimit(call)).toBe(false);
    expect(countsTowardRateLimit({ ...call, direction: 'self' })).toBe(false);
    expect(isOutbound(call.direction)).toBe(true);
  });

  it('still counts a zero-amount token the wallet sent, as before', () => {
    expect(countsTowardRateLimit({ direction: 'out', tokenAddress: USDC, amountRaw: '0' })).toBe(true);
  });
});
