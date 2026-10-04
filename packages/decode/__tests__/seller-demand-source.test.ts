import { afterEach, describe, expect, it, vi } from 'vitest';
import { SELLER_BLOCKS_PER_DAY, SELLER_STABLECOINS, alchemyTransferSource } from '../src/seller-demand.js';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';

describe('seller-demand chain constants', () => {
  it('lists the stablecoins per chain and a block rate per chain', () => {
    expect(SELLER_STABLECOINS.base).toEqual([USDC_BASE]);
    expect(SELLER_STABLECOINS.bsc).toEqual([USDT_BSC, USDC_BSC]);
    expect(SELLER_BLOCKS_PER_DAY.base).toBe(43_200);
    expect(SELLER_BLOCKS_PER_DAY.bsc).toBe(192_000);
  });
});

describe('alchemyTransferSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Alchemy for the given tokens and lower-cases the addresses it returns', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body).params[0]);
      return { status: 200, json: async () => ({ result: { transfers: [{ from: '0xAbC', to: '0xDeF', value: 12.5 }, { from: '0x1', to: null, value: 1 }] } }) };
    }));
    const source = alchemyTransferSource('https://x.test', 100n, undefined, SELLER_STABLECOINS.bsc);
    const rows = await source('in', '0xseller');
    expect(calls[0]?.contractAddresses).toEqual([USDT_BSC, USDC_BSC]);
    expect(calls[0]?.toAddress).toBe('0xseller');
    expect(calls[0]?.fromBlock).toBe('0x64');
    expect(rows).toEqual([{ from: '0xabc', to: '0xdef', usd: 12.5 }]);
  });

  it('defaults to Base USDC', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body).params[0]);
      return { status: 200, json: async () => ({ result: { transfers: [] } }) };
    }));
    await alchemyTransferSource('https://x.test', 1n)('out', '0xs');
    expect(calls[0]?.contractAddresses).toEqual([USDC_BASE]);
    expect(calls[0]?.fromAddress).toBe('0xs');
  });
});
