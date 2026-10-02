import { describe, it, expect } from 'vitest';
import { pricedSymbolForToken } from '../pricedTokens.js';

describe('pricedSymbolForToken', () => {
  it('prices canonical Base tokens by contract address, any case', () => {
    expect(pricedSymbolForToken('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')).toBe('USDC');
    expect(pricedSymbolForToken('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')).toBe('USDC');
    expect(pricedSymbolForToken('0x4200000000000000000000000000000000000006')).toBe('WETH');
    expect(pricedSymbolForToken('0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA')).toBe('USDC');
    expect(pricedSymbolForToken('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2')).toBe('USDT');
  });

  it('leaves any other contract unpriced, whatever symbol it claims', () => {
    // e.g. a spoofed token whose symbol() returns "USDC"
    expect(pricedSymbolForToken('0x1111111111111111111111111111111111111111')).toBeNull();
  });
});
