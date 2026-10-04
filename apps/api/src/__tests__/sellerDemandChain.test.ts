import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAlchemyNetworkDisabled, rpcHead, sellerDemandRpcUrl } from '../routes/risk.js';

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

describe('sellerDemandRpcUrl (review fixes)', () => {
  it('refuses to derive a BNB url from a Base url that has no base-mainnet host', () => {
    expect(sellerDemandRpcUrl('bsc', { SELLER_DEMAND_RPC_URL: 'https://eth-mainnet.g.alchemy.com/v2/k' })).toBeUndefined();
  });
});

describe('rpcHead', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws the JSON-RPC error message instead of BigInt(undefined)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'BNB_MAINNET is not enabled for this app. Visit ...' } }) })));
    await expect(rpcHead('https://bnb-mainnet.g.alchemy.com/v2/k')).rejects.toThrow(/not enabled for this app/);
  });

  it('returns the head as a bigint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x64' }) })));
    await expect(rpcHead('https://x.test')).resolves.toBe(100n);
  });
});
