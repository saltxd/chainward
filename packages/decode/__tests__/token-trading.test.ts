import { describe, it, expect } from 'vitest';
import { extractTokenTrading } from '../src/token-trading.js';

describe('extractTokenTrading', () => {
  it('returns null when agent has no tokenAddress', () => {
    expect(
      extractTokenTrading({ acp_details: { tokenAddress: null }, geckoterminal: null }),
    ).toBeNull();
  });

  it('extracts FDV and 24h volume from GeckoTerminal response', () => {
    const result = extractTokenTrading({
      acp_details: { tokenAddress: '0x444600d9fA140E9506D0cBC436Bffad3D5C3Febc', symbol: 'LUCIEN' },
      geckoterminal: {
        data: {
          attributes: {
            fdv_usd: '6128400.0',
            volume_usd: { h24: '24.50' },
          },
        },
      },
    });
    expect(result?.fdv_usd).toBeCloseTo(6128400, -1);
    expect(result?.volume_24h_usd).toBeCloseTo(24.5, 1);
    expect(result?.source).toBe('geckoterminal');
  });

  it('falls back to virtuals_api when geckoterminal data unavailable', () => {
    const result = extractTokenTrading({
      acp_details: {
        tokenAddress: '0xabc',
        symbol: 'X',
        token24hVolume: 1234,
      },
      geckoterminal: null,
    });
    expect(result?.source).toBe('virtuals_api');
    expect(result?.volume_24h_usd).toBe(1234);
  });
});
