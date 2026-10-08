import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Registration backfill goes through alchemy_getAssetTransfers (no block-range
// cap) instead of a 1.3M-block eth_getLogs that every fallback RPC refuses
// (HTTP 413). For an arbitrary user wallet it must stay bounded: a block window
// and a page cap per direction, like the old backfill's maxCount of 1,000.

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/db.js', () => ({ getDb: () => ({}) }));
vi.mock('../../lib/transactionStore.js', () => ({ insertTransactionIfNew: vi.fn(async () => true) }));
vi.mock('../../processors/tokenResolver.js', () => ({ resolveToken: vi.fn() }));
vi.mock('../../processors/protocolResolver.js', () => ({ resolveProtocol: vi.fn() }));
vi.mock('../../processors/priceResolver.js', () => ({ getEthPrice: vi.fn(async () => 0), getTokenUsdPrice: vi.fn(async () => 0) }));

import { fetchTransfers } from '../transferBackfill.js';

interface RpcBody {
  method: string;
  params: Array<Record<string, unknown>>;
}

function page(n: number, next?: string) {
  return {
    transfers: Array.from({ length: 100 }, (_, i) => ({
      blockNum: '0x1',
      hash: `0x${n}${i}`,
      from: '0xa',
      to: '0xb',
      value: 1,
      asset: 'ETH',
      category: 'external',
      rawContract: { value: null, address: null, decimal: null },
    })),
    ...(next ? { pageKey: next } : {}),
  };
}

describe('fetchTransfers (registration backfill via alchemy_getAssetTransfers)', () => {
  const calls: RpcBody[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as RpcBody;
        calls.push(body);
        const n = calls.length;
        return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result: page(n, `k${n}`) }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks Alchemy for the block window, not the whole chain', async () => {
    await fetchTransfers('0xabc', 'from', { fromBlock: 51_020_922n, maxPages: 1 });
    expect(calls[0]?.method).toBe('alchemy_getAssetTransfers');
    expect(calls[0]?.params[0]).toMatchObject({ fromBlock: '0x30a847a', toBlock: 'latest', fromAddress: '0xabc' });
  });

  it('retries a 429 with backoff instead of failing the backfill', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        n++;
        calls.push(JSON.parse(init.body) as RpcBody);
        if (n <= 2) return new Response('', { status: 429 });
        return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result: page(1) }));
      }),
    );
    const transfers = await fetchTransfers('0xabc', 'from', { fromBlock: 0n, maxPages: 1, retryDelayMs: 1 });
    expect(n).toBe(3);
    expect(transfers).toHaveLength(100);
  });

  it('gives up after the retry budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(fetchTransfers('0xabc', 'from', { fromBlock: 0n, maxPages: 1, retryDelayMs: 1 })).rejects.toThrow(/429/);
  });

  it('stops after the page cap even when Alchemy keeps returning a pageKey', async () => {
    const transfers = await fetchTransfers('0xabc', 'to', { fromBlock: 0n, maxPages: 3 });
    expect(calls).toHaveLength(3);
    expect(transfers).toHaveLength(300);
    expect(calls[2]?.params[0]).toMatchObject({ toAddress: '0xabc', pageKey: 'k2' });
  });
});
