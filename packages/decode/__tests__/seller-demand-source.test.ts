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

  it('keeps each transfer\'s tx hash (proxied payments are matched to their payer by it)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      json: async () => ({ result: { transfers: [{ from: '0xProxy', to: '0xSeller', value: 4, hash: '0xAbC1' }] } }),
    })));
    const rows = await alchemyTransferSource('https://x.test', 1n)('in', '0xseller');
    expect(rows).toEqual([{ from: '0xproxy', to: '0xseller', usd: 4, hash: '0xabc1' }]);
  });

  it('with minUsd, pages past dust until it has atLeast inflows of that size', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const page = (dust: number, real: number, pageKey?: string) => ({
      transfers: [
        ...Array.from({ length: dust }, (_, i) => ({ from: `0xd${i}`, to: '0xhub', value: 0.001 })),
        ...Array.from({ length: real }, (_, i) => ({ from: `0xr${i}`, to: '0xhub', value: 2 })),
      ],
      ...(pageKey ? { pageKey } : {}),
    });
    const pages: Record<string, ReturnType<typeof page>> = {
      first: page(600, 400, 'p2'),
      p2: page(300, 700, 'p3'),
      p3: page(0, 1000),
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const params = JSON.parse(init.body).params[0];
      calls.push(params);
      return { status: 200, json: async () => ({ result: pages[params.pageKey ?? 'first'] }) };
    }));
    const rows = await alchemyTransferSource('https://x.test', 1n)('in', '0xhub', { minUsd: 0.01, atLeast: 1000 });
    expect(calls.map((c) => c.pageKey)).toEqual([undefined, 'p2']);
    expect(rows).toHaveLength(1100);
    expect(rows.every((r) => r.usd >= 0.01)).toBe(true);
  });

  it('with minUsd, stops when the window has no more pages', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++;
      return { status: 200, json: async () => ({ result: { transfers: [{ from: '0xa', to: '0xhub', value: 0.001 }, { from: '0xb', to: '0xhub', value: 3 }] } }) };
    }));
    const rows = await alchemyTransferSource('https://x.test', 1n)('in', '0xhub', { minUsd: 0.01, atLeast: 1000 });
    expect(n).toBe(1);
    expect(rows).toEqual([{ from: '0xb', to: '0xhub', usd: 3 }]);
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
