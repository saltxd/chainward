import { describe, it, expect, vi } from 'vitest';
import {
  fetchExplorerTransfers,
  fetchRpcFixtures,
  isHeadRaceError,
  isRangeLimitError,
  planLogChunks,
  rpcFixturesHaveHistory,
  scanTransferLogs,
  type RpcCall,
} from '../src/rpc-fixtures.js';
import { TRANSFER_TOPIC, addressTopic } from '../src/data-fetch.js';

const WALLET = '0xb709860b8a1ce20019f3786d6982f773912bd286';
const OTHER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d';
const hex = (n: number) => '0x' + n.toString(16);

function transferLog(block: number, from: string, to: string, idx = 0) {
  return {
    address: TOKEN,
    topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
    blockNumber: hex(block),
    transactionHash: '0xtx' + block.toString(16) + idx,
    logIndex: hex(idx),
  };
}

describe('planLogChunks', () => {
  it('covers the range newest-first with spans strictly under the chunk size', () => {
    const chunks = planLogChunks(1_000, 25_999, 10_000);
    expect(chunks).toEqual([
      { from: 16_000, to: 25_999 },
      { from: 6_000, to: 15_999 },
      { from: 1_000, to: 5_999 },
    ]);
    for (const c of chunks) expect(c.to - c.from).toBeLessThan(10_000);
  });

  it('returns a single chunk when the range fits, and none for an inverted range', () => {
    expect(planLogChunks(100, 150, 10_000)).toEqual([{ from: 100, to: 150 }]);
    expect(planLogChunks(200, 100, 10_000)).toEqual([]);
  });
});

describe('error classification', () => {
  it('recognises the span/limit errors the public BSC endpoints return', () => {
    expect(isRangeLimitError('block span 50000 of range [1, 2] exceeds the limit 10000')).toBe(true);
    expect(isRangeLimitError('Log response size exceeded. Maximum allowed number of requested blocks is 1000')).toBe(true);
    expect(isRangeLimitError('request timed out')).toBe(true);
    expect(isRangeLimitError('invalid argument 0: json: cannot unmarshal')).toBe(false);
  });

  it('recognises the multi-node head race', () => {
    expect(isHeadRaceError('block 125480434 is beyond the latest block 125480433 of this node, retry later')).toBe(true);
    expect(isHeadRaceError('execution reverted')).toBe(false);
  });
});

/** An RPC mock that enforces a per-call block span limit and records every range asked for. */
function spanLimitedRpc(limit: number, logsAt: Record<number, ReturnType<typeof transferLog>[]> = {}) {
  const ranges: Array<{ from: number; to: number }> = [];
  const rpcCall: RpcCall = vi.fn(async (_url, method, params) => {
    if (method !== 'eth_getLogs') throw new Error(`unexpected ${method}`);
    const f = (params[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] });
    const from = parseInt(f.fromBlock, 16);
    const to = parseInt(f.toBlock, 16);
    if (to - from >= limit) {
      throw new Error(`block span ${to - from} of range [${from}, ${to}] exceeds the limit ${limit}`);
    }
    ranges.push({ from, to });
    const out: ReturnType<typeof transferLog>[] = [];
    for (const [b, logs] of Object.entries(logsAt)) {
      const n = Number(b);
      if (n < from || n > to) continue;
      for (const lg of logs) {
        const isFrom = f.topics[1] === lg.topics[1];
        const isTo = f.topics[2] === lg.topics[2];
        if ((f.topics[1] && isFrom) || (f.topics[2] && isTo)) out.push(lg);
      }
    }
    return out;
  });
  return { rpcCall, ranges };
}

describe('scanTransferLogs', () => {
  it('asks for both directions per chunk and returns the logs with the oldest block scanned', async () => {
    const { rpcCall, ranges } = spanLimitedRpc(10_000, {
      95_000: [transferLog(95_000, WALLET, OTHER)],
      85_000: [transferLog(85_000, OTHER, WALLET)],
    });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 80_000,
      toBlock: 99_999,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
    });
    expect(res.logs).toHaveLength(2);
    expect(res.truncated).toBe(false);
    expect(res.scannedFromBlock).toBe(80_000);
    // 2 chunks × (from + to) = 4 calls
    expect(ranges).toHaveLength(4);
    expect(ranges.every((r) => r.to - r.from < 10_000)).toBe(true);
  });

  it('halves the chunk on a range-limit error and re-plans the unscanned region', async () => {
    const { rpcCall, ranges } = spanLimitedRpc(1_000, { 90_500: [transferLog(90_500, WALLET, OTHER)] });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 90_000,
      toBlock: 99_999,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
      concurrency: 2,
    });
    expect(res.logs).toHaveLength(1);
    expect(res.truncated).toBe(false);
    expect(res.scannedFromBlock).toBe(90_000);
    // Settled on a span the endpoint accepts (strictly below 1,000).
    expect(res.chunkBlocksUsed).toBeLessThanOrEqual(1_000);
    expect(ranges.every((r) => r.to - r.from < 1_000)).toBe(true);
    // Every block in the window was covered exactly once per direction.
    const covered = new Set<number>();
    for (const r of ranges) for (let b = r.from; b <= r.to; b++) covered.add(b);
    expect(covered.size).toBe(10_000);
  });

  it('retries the newest chunk a couple of blocks lower on the head race', async () => {
    let raced = false;
    const rpcCall: RpcCall = vi.fn(async (_u, _m, params) => {
      const f = params[0] as { toBlock: string };
      if (parseInt(f.toBlock, 16) === 1_000 && !raced) {
        raced = true;
        throw new Error('block 1000 is beyond the latest block 999 of this node, retry later');
      }
      return [];
    });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 0,
      toBlock: 1_000,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
    });
    expect(res.truncated).toBe(false);
    expect(raced).toBe(true);
  });

  it('truncates (not fails) when a deep chunk errors after recent chunks succeeded', async () => {
    const rpcCall: RpcCall = vi.fn(async (_u, _m, params) => {
      const f = params[0] as { fromBlock: string };
      if (parseInt(f.fromBlock, 16) < 20_000) throw new Error('internal error');
      return [];
    });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 0,
      toBlock: 29_999,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
      concurrency: 1,
    });
    expect(res.truncated).toBe(true);
    expect(res.scannedFromBlock).toBe(20_000);
  });

  it('throws when even the newest chunk cannot be read, so the caller can switch RPC', async () => {
    const rpcCall: RpcCall = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(
      scanTransferLogs({ address: WALLET, rpcUrl: 'rpc', fromBlock: 0, toBlock: 999, chunkBlocks: 1000, timeoutMs: 1, rpcCall }),
    ).rejects.toThrow('ECONNRESET');
  });

  it('stops at the wall-clock budget and flags truncation, keeping the newest chunks', async () => {
    let t = 0;
    const now = () => t;
    const rpcCall: RpcCall = vi.fn(async () => {
      t += 600; // each call "takes" 600ms
      return [];
    });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 0,
      toBlock: 99_999,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
      concurrency: 1,
      budgetMs: 1_000,
      now,
    });
    expect(res.truncated).toBe(true);
    expect(res.scannedFromBlock).toBeGreaterThan(0);
    expect((rpcCall as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(20);
  });

  it('stops scanning deeper once the raw-log cap is reached (busy hub wallets)', async () => {
    const rpcCall: RpcCall = vi.fn(async (_u, _m, params) => {
      const f = params[0] as { toBlock: string };
      const to = parseInt(f.toBlock, 16);
      return Array.from({ length: 50 }, (_, i) => transferLog(to - i, OTHER, WALLET, i));
    });
    const res = await scanTransferLogs({
      address: WALLET,
      rpcUrl: 'rpc',
      fromBlock: 0,
      toBlock: 99_999,
      chunkBlocks: 10_000,
      timeoutMs: 1000,
      rpcCall,
      concurrency: 1,
      maxLogs: 120,
    });
    expect(res.truncated).toBe(true);
    expect(res.logs.length).toBeGreaterThanOrEqual(120);
    expect(res.scannedFromBlock).toBeGreaterThan(50_000);
  });
});

/** A full fake BSC node: fresh head, 0.45s blocks, one inbound USDC transfer, balances. */
function fakeBscNode(overrides: { headAgeSec?: number; nonce?: string; code?: string } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const HEAD = 125_480_000;
  const headTs = nowSec - (overrides.headAgeSec ?? 1);
  const calls: string[] = [];
  const rpcCall: RpcCall = vi.fn(async (_url, method, params) => {
    calls.push(method);
    switch (method) {
      case 'eth_getBlockByNumber': {
        const tag = params[0] as string;
        if (tag === 'latest') return { number: hex(HEAD), hash: '0x' + 'ab'.repeat(32), timestamp: hex(headTs) };
        const n = parseInt(tag, 16);
        return { number: tag, hash: '0x00', timestamp: hex(Math.round(headTs - (HEAD - n) * 0.45)) };
      }
      case 'eth_getLogs': {
        const f = params[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
        const to = parseInt(f.toBlock, 16);
        // one inbound USDC transfer ~1 hour ago (8000 blocks back) in the newest chunk
        if (f.topics[2] === addressTopic(WALLET) && to >= HEAD - 8_000 && parseInt(f.fromBlock, 16) <= HEAD - 8_000) {
          return [transferLog(HEAD - 8_000, OTHER, WALLET)];
        }
        return [];
      }
      case 'eth_getCode':
        return overrides.code ?? '0x';
      case 'eth_getTransactionCount':
        return overrides.nonce ?? '0x2a';
      case 'eth_getBalance':
        return '0xde0b6b3a7640000'; // 1 BNB
      case 'eth_call': {
        const c = params[0] as { to: string };
        // USDC balance 12.5 (18 decimals); USDT 0; the airdropped token: non-zero
        if (c.to.toLowerCase() === TOKEN) return '0x' + (12_500_000_000_000_000_000n).toString(16);
        return '0x0';
      }
      default:
        throw new Error(`unexpected ${method}`);
    }
  });
  return { rpcCall, calls, HEAD };
}

describe('fetchRpcFixtures (bsc)', () => {
  const rpcs = [{ url: 'https://primary.test', logChunkBlocks: 10_000 }];

  it('assembles the Base-shaped fixture set from RPC only, with the window it scanned', async () => {
    const node = fakeBscNode();
    const fx = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: node.rpcCall,
      windowDays: 1,
      explorerApiKey: null,
    });
    expect(fx.chain).toBe('bsc');
    expect(fx.data_source.rpc_role).toBe('public');
    expect(fx.data_source.head_stale).toBe(false);
    expect(fx.sentinel_block).toEqual({ number: hex(node.HEAD), hash: '0x' + 'ab'.repeat(32) });
    expect(fx.sentinel_nonce.result).toBe('0x2a');
    expect(fx.blockscout_counters.transactions_count).toBe('42');
    expect(fx.sentinel_code.result).toBe('0x');
    // BSC USDC is 18 decimals — raw hex passes through untouched for computeBalances to scale.
    expect(BigInt(fx.sentinel_usdc_balance.result)).toBe(12_500_000_000_000_000_000n);
    expect(Object.keys(fx.stablecoin_balances).sort()).toEqual(['USDC', 'USDT']);
    expect(fx.blockscout_transfers.items).toHaveLength(1);
    expect(fx.blockscout_transfers.items[0].to.hash).toBe(WALLET);
    expect(fx.blockscout_transfers.items[0].token.address).toBe(TOKEN);
    // ~1 hour old: 8000 blocks × 0.45s = 3600s
    const age = Date.now() - new Date(fx.blockscout_transfers.items[0].timestamp).getTime();
    expect(age).toBeGreaterThan(3_500_000);
    expect(age).toBeLessThan(3_700_000);
    expect(fx.window.source).toBe('rpc_logs');
    expect(fx.window.days).toBe(1);
    expect(fx.window.requested_days).toBe(1);
    expect(fx.window.block_seconds).toBeCloseTo(0.45, 2);
    expect(fx.window.to_block).toBe(node.HEAD - 2);
    expect(fx.window.to_block - fx.window.from_block + 1).toBe(Math.round(86_400 / 0.45));
    expect(fx.window.truncated).toBe(false);
    expect(fx.token_count).toBe(1);
    expect(fx.token_count_lower_bound).toBe(false);
    expect(fx.acp_details).toEqual({ data: null });
    expect(rpcFixturesHaveHistory(fx)).toBe(true);
  });

  it('reports the days actually covered when the scan stops at its budget', async () => {
    const node = fakeBscNode();
    let t = 0;
    const slowRpc: RpcCall = async (u, m, p, to) => {
      if (m === 'eth_getLogs') t += 5_000; // each log call "costs" 5s
      return node.rpcCall(u, m, p, to);
    };
    const fx = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: slowRpc,
      windowDays: 14,
      explorerApiKey: null,
      concurrency: 1,
      scanBudgetMs: 1,
      now: () => t,
    });
    expect(fx.window.truncated).toBe(true);
    expect(fx.window.requested_days).toBe(14);
    // One 10k-block chunk at 0.45s/block ≈ 0.052 days
    expect(fx.window.days).toBeGreaterThan(0.04);
    expect(fx.window.days).toBeLessThan(0.06);
    expect(fx.blockscout_transfers.truncated).toBe(true);
  });

  it('refuses a stale RPC head and moves to the next endpoint', async () => {
    const stale = fakeBscNode({ headAgeSec: 5_000 });
    const fresh = fakeBscNode();
    const rpcCall: RpcCall = (url, m, p, t) => (url.includes('stale') ? stale.rpcCall(url, m, p, t) : fresh.rpcCall(url, m, p, t));
    const fx = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs: [
        { url: 'https://stale.test', logChunkBlocks: 10_000 },
        { url: 'https://fresh.test', logChunkBlocks: 10_000 },
      ],
      rpcCall,
      windowDays: 1,
      explorerApiKey: null,
    });
    expect(fx.window.rpc_url).toBe('https://fresh.test');
    expect(stale.calls).not.toContain('eth_getLogs');
  });

  it('throws when every endpoint fails', async () => {
    const rpcCall: RpcCall = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      fetchRpcFixtures('bsc', WALLET, { fetchTimeoutMs: 1, rpcs, rpcCall, windowDays: 1, explorerApiKey: null }),
    ).rejects.toThrow('boom');
  });

  it('reads through the cache: second call makes no RPC calls, and the key is per chain+address', async () => {
    const store = new Map<string, string>();
    const ttls: number[] = [];
    const cache = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string, ttl: number) => {
        ttls.push(ttl);
        store.set(k, v);
      },
    };
    const node = fakeBscNode();
    const first = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: node.rpcCall,
      windowDays: 1,
      explorerApiKey: null,
      cache,
    });
    const callsAfterFirst = node.calls.length;
    const second = await fetchRpcFixtures('bsc', WALLET.toUpperCase().replace('0X', '0x'), {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: node.rpcCall,
      windowDays: 1,
      explorerApiKey: null,
      cache,
    });
    expect(node.calls.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
    expect([...store.keys()]).toEqual([`risk:rpcfx:bsc:${WALLET}:1d`]);
    expect(ttls).toEqual([600]);
  });

  it('uses the explorer API for transfers when a key is present and falls back to RPC logs when it fails', async () => {
    const node = fakeBscNode();
    const nowSec = Math.floor(Date.now() / 1000);
    const okFetch = vi.fn(async (url: string) => {
      expect(url).toContain('chainid=56');
      expect(url).toContain('action=tokentx');
      expect(url).toContain('apikey=secret');
      return new Response(
        JSON.stringify({
          status: '1',
          result: [
            { from: OTHER, to: WALLET, timeStamp: String(nowSec - 100), contractAddress: TOKEN, hash: '0x1' },
            { from: WALLET, to: OTHER, timeStamp: String(nowSec - 200_000), contractAddress: TOKEN, hash: '0x2' },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const viaApi = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: node.rpcCall,
      windowDays: 1,
      explorerApiKey: 'secret',
      fetchImpl: okFetch,
    });
    expect(viaApi.window.source).toBe('explorer_api');
    expect(viaApi.window.days).toBe(30);
    expect(viaApi.blockscout_transfers.items).toHaveLength(2);
    expect(viaApi.blockscout_transfers.items[0].timestamp).toBe(new Date((nowSec - 100) * 1000).toISOString());
    expect(node.calls).not.toContain('eth_getLogs');

    const badFetch = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const node2 = fakeBscNode();
    const viaRpc = await fetchRpcFixtures('bsc', WALLET, {
      fetchTimeoutMs: 1000,
      rpcs,
      rpcCall: node2.rpcCall,
      windowDays: 1,
      explorerApiKey: 'secret',
      fetchImpl: badFetch,
    });
    expect(viaRpc.window.source).toBe('rpc_logs');
    expect(node2.calls).toContain('eth_getLogs');
  });

  it('reports no history for an address with nothing on-chain', async () => {
    const empty = fakeBscNode({ nonce: '0x0' });
    const rpcCall: RpcCall = async (u, m, p, t) => {
      if (m === 'eth_getLogs') return [];
      if (m === 'eth_getBalance') return '0x0';
      if (m === 'eth_call') return '0x0';
      return empty.rpcCall(u, m, p, t);
    };
    const fx = await fetchRpcFixtures('bsc', WALLET, { fetchTimeoutMs: 1000, rpcs, rpcCall, windowDays: 1, explorerApiKey: null });
    expect(rpcFixturesHaveHistory(fx)).toBe(false);
  });
});

describe('fetchExplorerTransfers paging', () => {
  it('stops once the oldest row on a page is past the 30-day window', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const page = (ageSec: number) =>
      Array.from({ length: 1000 }, (_, i) => ({
        from: OTHER,
        to: WALLET,
        timeStamp: String(nowSec - ageSec - i),
        contractAddress: TOKEN,
        hash: '0x' + i,
      }));
    const fetchImpl = vi.fn(async (url: string) => {
      const p = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ status: '1', result: p === 1 ? page(10) : page(40 * 86_400) }));
    }) as unknown as typeof fetch;
    const res = await fetchExplorerTransfers('bsc', WALLET, 'k', 1000, fetchImpl, nowSec * 1000);
    expect(res.items).toHaveLength(2000);
    expect(res.truncated).toBe(false);
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('treats "No transactions found" as an empty answer, not a failure', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: '0', message: 'No transactions found', result: [] }))) as unknown as typeof fetch;
    const res = await fetchExplorerTransfers('bsc', WALLET, 'k', 1000, fetchImpl);
    expect(res).toEqual({ items: [], truncated: false });
  });
});
