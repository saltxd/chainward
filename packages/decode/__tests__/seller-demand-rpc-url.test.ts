import { describe, expect, it } from 'vitest';
import { sellerDemandRpcUrl } from '../src/seller-demand.js';

// The api's seller and hire checks and the indexer's boards all pick their
// Alchemy URL here, so a board traces funding through the same endpoint the
// paid check does.
describe('sellerDemandRpcUrl', () => {
  it('uses SELLER_DEMAND_RPC_URL for base, falling back to BASE_RPC_URL', () => {
    expect(sellerDemandRpcUrl('base', { SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k' })).toBe(
      'https://base-mainnet.g.alchemy.com/v2/k',
    );
    expect(sellerDemandRpcUrl('base', { BASE_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/b' })).toBe(
      'https://base-mainnet.g.alchemy.com/v2/b',
    );
  });

  it('derives the BNB url from the Base one when no BSC url is set', () => {
    expect(sellerDemandRpcUrl('bsc', { BASE_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k' })).toBe(
      'https://bnb-mainnet.g.alchemy.com/v2/k',
    );
  });

  it('prefers SELLER_DEMAND_BSC_RPC_URL for bsc', () => {
    expect(
      sellerDemandRpcUrl('bsc', {
        SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k',
        SELLER_DEMAND_BSC_RPC_URL: 'https://bnb-mainnet.g.alchemy.com/v2/other',
      }),
    ).toBe('https://bnb-mainnet.g.alchemy.com/v2/other');
  });

  it('returns undefined for a non-Alchemy url or a host it cannot rewrite', () => {
    expect(sellerDemandRpcUrl('base', { BASE_RPC_URL: 'http://localhost:8545' })).toBeUndefined();
    expect(sellerDemandRpcUrl('bsc', { SELLER_DEMAND_RPC_URL: 'https://eth-mainnet.g.alchemy.com/v2/k' })).toBeUndefined();
    expect(sellerDemandRpcUrl('bsc', {})).toBeUndefined();
  });
});
