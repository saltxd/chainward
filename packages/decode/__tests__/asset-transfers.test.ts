import { afterEach, describe, expect, it, vi } from 'vitest';
import { alchemyAssetTransfers } from '../src/seller-demand.js';

// alchemy_getAssetTransfers on a busy token (WBTC on Base, a mints query) runs into Alchemy's
// own ~5 s limit about half the time and answers "Internal server error"; the same query
// usually passes on the next try.
const answer = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('alchemyAssetTransfers', () => {
  it('tries once more after an internal server error', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Internal server error' } }))
      .mockResolvedValueOnce(answer({ jsonrpc: '2.0', id: 1, result: { transfers: [{ hash: '0x1' }] } }));
    vi.stubGlobal('fetch', fetch);
    const r = await alchemyAssetTransfers('https://base-mainnet.g.alchemy.com/v2/test', { fromBlock: '0x0' });
    expect(r.transfers).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after a second internal server error', async () => {
    const fetch = vi.fn().mockImplementation(async () => answer({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Internal server error' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(alchemyAssetTransfers('https://base-mainnet.g.alchemy.com/v2/test', { fromBlock: '0x0' })).rejects.toThrow(/Internal server error/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
