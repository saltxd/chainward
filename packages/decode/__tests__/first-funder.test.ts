import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUB_INFLOWS, SELLER_STABLECOINS, alchemyFirstFunderSource } from '../src/seller-demand.js';

// alchemy_getAssetTransfers, earliest inbound transfer first. No network: fetch is stubbed.
function stubAlchemy(transfers: unknown[]) {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body).params[0]);
      return { status: 200, json: async () => ({ result: { transfers } }) };
    }),
  );
  return calls;
}

describe('alchemyFirstFunderSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the first top-level BNB transfer in, over all history', async () => {
    const calls = stubAlchemy([{ from: '0xFUNDER', to: '0xhirer', hash: '0xabc', blockNum: '0x10', value: 0.01 }]);
    const first = await alchemyFirstFunderSource('https://x.test', SELLER_STABLECOINS.bsc)('native', '0xHirer');
    expect(calls[0]).toMatchObject({
      category: ['external'],
      order: 'asc',
      maxCount: '0x1',
      fromBlock: '0x0',
      toAddress: '0xhirer',
      excludeZeroValue: true,
    });
    expect(calls[0]).not.toHaveProperty('contractAddresses');
    expect(first).toEqual({ from: '0xfunder', hash: '0xabc', block: 16 });
  });

  it('asks for the first stablecoin transfer in, limited to the given tokens', async () => {
    const calls = stubAlchemy([{ from: '0xAa', to: '0xhirer', hash: '0xdef', blockNum: '0x20', value: 5 }]);
    const first = await alchemyFirstFunderSource('https://x.test', SELLER_STABLECOINS.bsc)('stable', '0xhirer');
    expect(calls[0]).toMatchObject({ category: ['erc20'], contractAddresses: SELLER_STABLECOINS.bsc, order: 'asc' });
    expect(first).toEqual({ from: '0xaa', hash: '0xdef', block: 32 });
  });

  it('returns null when nothing ever came in', async () => {
    stubAlchemy([]);
    expect(await alchemyFirstFunderSource('https://x.test', SELLER_STABLECOINS.bsc)('native', '0xnew')).toBeNull();
  });

  it('surfaces a JSON-RPC error as a thrown Error (so the route can map "not enabled")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => ({ error: { code: -32600, message: 'BNB_MAINNET is not enabled for this app' } }),
      })),
    );
    await expect(alchemyFirstFunderSource('https://x.test', [])('native', '0x1')).rejects.toThrow(/not enabled/);
  });

  it('shares the seller check hub threshold', () => {
    expect(HUB_INFLOWS).toBe(1000);
  });
});
