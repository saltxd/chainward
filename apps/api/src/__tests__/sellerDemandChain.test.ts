import { describe, expect, it } from 'vitest';
import { isAlchemyNetworkDisabled, sellerDemandRpcUrl } from '../routes/risk.js';

describe('sellerDemandRpcUrl', () => {
  it('uses SELLER_DEMAND_RPC_URL for base', () => {
    expect(sellerDemandRpcUrl('base', { SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k' })).toBe('https://base-mainnet.g.alchemy.com/v2/k');
  });
  it('derives the BNB url from the Base one when no BSC url is set', () => {
    expect(sellerDemandRpcUrl('bsc', { SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k' })).toBe('https://bnb-mainnet.g.alchemy.com/v2/k');
  });
  it('prefers SELLER_DEMAND_BSC_RPC_URL', () => {
    expect(sellerDemandRpcUrl('bsc', { SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k', SELLER_DEMAND_BSC_RPC_URL: 'https://bnb-mainnet.g.alchemy.com/v2/other' })).toBe('https://bnb-mainnet.g.alchemy.com/v2/other');
  });
  it('returns undefined for a non-Alchemy url', () => {
    expect(sellerDemandRpcUrl('base', { BASE_RPC_URL: 'http://localhost:8545' })).toBeUndefined();
  });
});

describe('isAlchemyNetworkDisabled', () => {
  it('recognises the "not enabled for this app" error', () => {
    expect(isAlchemyNetworkDisabled(new Error('alchemy_getAssetTransfers: BNB_MAINNET is not enabled for this app. Visit ...'))).toBe(true);
    expect(isAlchemyNetworkDisabled(new Error('transfer source throttled'))).toBe(false);
  });
});
