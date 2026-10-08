import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _resetHeadCache } from '@chainward/common';
import { fetchFixtures, mapAlchemyTransfers } from '../src/data-fetch.js';
import { computeQuickDecodeData } from '../src/quick-decode.js';
import { deriveRiskFlags } from '../src/risk-flags.js';

// The paid counterparty check of 2026-10-07: the sentinel node was ~5 days stale,
// the fallback RPC refused the 30-day eth_getLogs scan, Blockscout answered 403
// from the cluster, and the report said "No ERC-20 transfers in the checked
// window" about a wallet with transfers on Oct 7, 4, 3, 1, Sep 30 and 29.

vi.mock('../src/sentinel-block.js', () => ({
  fetchCurrentBlock: vi.fn(async () => ({ number: 52_276_747, hash: '0xfeed' })),
  parseSentinelBlock: vi.fn((b: { number: string; hash: string }) => ({ number: parseInt(b.number, 16), hash: b.hash })),
}));

const WALLET = '0x2d0b6cd9485e59a6edc10b048227faf0e81d174d';
const OTHER = '0x' + '9'.repeat(40);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const SENTINEL = 'http://cw-sentinel:8545';
const PUBLIC_FALLBACK = 'https://base.drpc.example';
const ALCHEMY = 'https://base-mainnet.g.alchemy.com/v2/SECRETKEY';
const NOW = new Date('2026-10-07T18:00:00Z');
const HEAD = 52_276_747;

function body(init: any): any {
  try {
    return init?.body ? JSON.parse(init.body) : undefined;
  } catch {
    return undefined;
  }
}

const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
const rpcError = (message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32600, message } }));

const headAt = (number: number, ageSec: number) => ({
  number: '0x' + number.toString(16),
  timestamp: '0x' + Math.floor(Date.now() / 1000 - ageSec).toString(16),
  hash: '0xfeed',
});

interface AlchemyRow {
  from: string;
  to: string;
  blockNum: string;
  uniqueId: string;
  hash: string;
  value: number;
  rawContract: { address: string };
  metadata: { blockTimestamp: string };
  category: 'erc20';
}

function alchemyRow(i: number, from: string, to: string, iso: string): AlchemyRow {
  return {
    from,
    to,
    blockNum: '0x' + (HEAD - i * 1000).toString(16),
    uniqueId: `0x${String(i).padStart(64, '0')}:log:0x1`,
    hash: `0x${String(i).padStart(64, '0')}`,
    value: 1,
    rawContract: { address: USDC },
    metadata: { blockTimestamp: iso },
    category: 'erc20',
  };
}

// The wallet's real recent ERC-20 activity (inflows and USDC outflows).
const INFLOWS = [
  alchemyRow(1, OTHER, WALLET, '2026-10-07T09:12:00Z'),
  alchemyRow(2, OTHER, WALLET, '2026-10-03T11:00:00Z'),
  alchemyRow(3, OTHER, WALLET, '2026-10-01T15:30:00Z'),
  alchemyRow(4, OTHER, WALLET, '2026-09-30T08:45:00Z'),
];
const OUTFLOWS = [
  alchemyRow(5, WALLET, OTHER, '2026-10-04T10:00:00Z'),
  alchemyRow(6, WALLET, OTHER, '2026-10-03T12:00:00Z'),
  alchemyRow(7, WALLET, OTHER, '2026-09-29T07:00:00Z'),
];

interface Upstream {
  /** eth_getLogs on the (non-Alchemy) fallback RPC. */
  logs: 'http_400' | 'ok_empty';
  /** alchemy_getAssetTransfers answer. */
  alchemy: 'error' | 'ok' | 'ok_empty';
  blockscout: 403 | 200;
  /** eth_call (the USDC balanceOf) answer: a value, or every RPC throttling it. */
  usdc?: 'ok' | 'throttled';
}

/** Every upstream the fetch touches, scripted. Records which RPC methods each host saw. */
function upstreams(u: Upstream) {
  const seen: Array<{ host: string; method?: string; params?: any }> = [];
  const impl = vi.fn(async (url: any, init?: any) => {
    const s = String(url);
    const b = body(init);
    seen.push({ host: new URL(s).host, method: b?.method, params: b?.params?.[0] });
    if (s.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
    if (s.includes('blockscout.com')) {
      return u.blockscout === 403
        ? new Response('<html>Cloudflare</html>', { status: 403 })
        : new Response(JSON.stringify({ items: [], transactions_count: '0', token_transfers_count: '0' }));
    }
    const method = b?.method;
    if (method === 'eth_getBlockByNumber') {
      // The sentinel answers with a head ~5 days old; every other RPC is at tip.
      return rpc(s.startsWith(SENTINEL) ? headAt(51_999_654, 551_631) : headAt(HEAD, 1));
    }
    if (method === 'eth_getLogs') {
      if (s.includes('alchemy.com')) {
        return rpcError(
          'Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range. Based on your parameters, this block range should work: [0x31db8eb, 0x31db8f4].',
        );
      }
      return u.logs === 'http_400' ? new Response('bad request', { status: 400 }) : rpc([]);
    }
    if (method === 'alchemy_getAssetTransfers') {
      if (u.alchemy === 'error') return rpcError('internal error');
      if (u.alchemy === 'ok_empty') return rpc({ transfers: [] });
      const p = b.params[0];
      return rpc({ transfers: p.toAddress ? INFLOWS : p.fromAddress ? OUTFLOWS : [] });
    }
    // eth_getCode / eth_getTransactionCount / eth_getBalance / eth_call
    if (method === 'eth_getTransactionCount') return rpc('0x81'); // nonce 129
    if (method === 'eth_call') {
      if (u.usdc === 'throttled') return new Response('{"error":"rate limited"}', { status: 429 });
      if (u.usdc === 'ok') return rpc('0x' + (5_451_386_272n).toString(16).padStart(64, '0')); // 5,451.386272 USDC
      return rpc('0x0');
    }
    return rpc('0x0');
  });
  return { impl, seen };
}

async function decode(fixtures: Awaited<ReturnType<typeof fetchFixtures>>) {
  const { data } = computeQuickDecodeData({
    input: WALLET,
    wallet_address: WALLET,
    job_id: 'job',
    pipeline_version: 'test',
    now: NOW,
    fixtures,
  });
  return { data, assessment: deriveRiskFlags(data) };
}

describe('transfer sources: a failed read is never reported as an empty window', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    _resetHeadCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _resetHeadCache();
  });

  it("reproduces 2026-10-07: stale node, fallback refuses getLogs, Blockscout 403 -> no inactive_no_history", async () => {
    const { impl } = upstreams({ logs: 'http_400', alchemy: 'error', blockscout: 403 });
    global.fetch = impl as any;

    const fx = await fetchFixtures(WALLET, {
      sentinelRpc: SENTINEL,
      fallbackRpc: PUBLIC_FALLBACK,
      fetchTimeoutMs: 2000,
    });
    const { data, assessment } = await decode(fx);

    expect(assessment.flags.map((f) => f.id)).not.toContain('inactive_no_history');
    expect(data.fetch_meta.transfers_unavailable).toMatch(/RPC logs/);
    expect(data.fetch_meta.transfers_unavailable).toMatch(/Blockscout/);
    expect(data.survival.classification).toBe('unknown');
    expect(data.survival.rationale).toMatch(/not assessed/i);
  });

  it('also when the Alchemy transfer source is configured and fails too, and never leaks the RPC key', async () => {
    const { impl } = upstreams({ logs: 'http_400', alchemy: 'error', blockscout: 403 });
    global.fetch = impl as any;

    const fx = await fetchFixtures(WALLET, {
      sentinelRpc: SENTINEL,
      fallbackRpc: ALCHEMY,
      fetchTimeoutMs: 2000,
    });
    const { data, assessment } = await decode(fx);

    expect(assessment.flags).toEqual([]);
    expect(data.fetch_meta.transfers_unavailable).toMatch(/Alchemy/);
    expect(data.fetch_meta.transfers_unavailable).toMatch(/Blockscout/);
    expect(JSON.stringify(data)).not.toContain('SECRETKEY');
  });
});

describe('transfer sources: Alchemy transfer index', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    _resetHeadCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _resetHeadCache();
  });

  it('reads the active wallet through Alchemy when the node is stale and the fallback refuses getLogs', async () => {
    const { impl, seen } = upstreams({ logs: 'http_400', alchemy: 'ok', blockscout: 403 });
    global.fetch = impl as any;

    const fx = await fetchFixtures(WALLET, {
      sentinelRpc: SENTINEL,
      fallbackRpc: PUBLIC_FALLBACK,
      alchemyRpc: ALCHEMY,
      fetchTimeoutMs: 2000,
    });
    const { data, assessment } = await decode(fx);

    expect(assessment.flags.map((f) => f.id)).not.toContain('inactive_no_history');
    expect(data.fetch_meta.transfers_source).toBe('alchemy');
    expect(data.fetch_meta.transfers_unavailable).toBeUndefined();
    expect(data.activity.latest_transfer_at).toBe('2026-10-07T09:12:00Z');
    expect(data.activity.transfers_30d).toBe(7);
    // Oct 7, 4, 3, 3, 1 are inside the 7 days before Oct 7 18:00; Sep 30 08:45 is not.
    expect(data.activity.transfers_7d).toBe(5);
    expect(data.survival.classification).toBe('active');

    const calls = seen.filter((c) => c.method === 'alchemy_getAssetTransfers').map((c) => c.params);
    expect(calls).toHaveLength(2);
    expect(calls.map((p) => (p.fromAddress ? 'from' : 'to')).sort()).toEqual(['from', 'to']);
    for (const p of calls) {
      expect(p).toMatchObject({
        category: ['erc20'],
        order: 'desc',
        withMetadata: true,
        excludeZeroValue: false,
        fromBlock: '0x' + (HEAD - 1_300_000).toString(16),
      });
    }
  });

  it('goes straight to the transfer index when the fresh RPC is itself Alchemy (its getLogs is capped at 10 blocks)', async () => {
    const { impl, seen } = upstreams({ logs: 'http_400', alchemy: 'ok', blockscout: 403 });
    global.fetch = impl as any;

    const fx = await fetchFixtures(WALLET, { sentinelRpc: SENTINEL, fallbackRpc: ALCHEMY, fetchTimeoutMs: 2000 });
    const { data } = await decode(fx);

    expect(data.fetch_meta.transfers_source).toBe('alchemy');
    expect(data.activity.latest_transfer_at).toBe('2026-10-07T09:12:00Z');
    expect(seen.some((c) => c.method === 'eth_getLogs' && c.host.endsWith('alchemy.com'))).toBe(false);
  });

  it('still raises inactive_no_history when Alchemy answers with no transfers, naming Alchemy as the source', async () => {
    const { impl } = upstreams({ logs: 'http_400', alchemy: 'ok_empty', blockscout: 403 });
    global.fetch = impl as any;

    const fx = await fetchFixtures(WALLET, {
      sentinelRpc: SENTINEL,
      fallbackRpc: PUBLIC_FALLBACK,
      alchemyRpc: ALCHEMY,
      fetchTimeoutMs: 2000,
    });
    const { data, assessment } = await decode(fx);

    const flag = assessment.flags.find((f) => f.id === 'inactive_no_history');
    expect(flag).toBeDefined();
    expect(flag!.evidence).toContain("read from Alchemy's Base transfer index");
    expect(flag!.evidence).not.toMatch(/public Base RPC logs/);
    expect(data.fetch_meta.transfers_unavailable).toBeUndefined();
  });

  it('keeps the node primary: a fresh sentinel answers from its own logs and Alchemy is never asked', async () => {
    const { impl, seen } = upstreams({ logs: 'ok_empty', alchemy: 'ok', blockscout: 403 });
    global.fetch = vi.fn(async (url: any, init?: any) => {
      // A fresh sentinel this time.
      if (String(url).startsWith(SENTINEL) && body(init)?.method === 'eth_getBlockByNumber') return rpc(headAt(HEAD, 1));
      return impl(url, init);
    }) as any;

    const fx = await fetchFixtures(WALLET, { sentinelRpc: SENTINEL, alchemyRpc: ALCHEMY, fetchTimeoutMs: 2000 });
    const { data } = await decode(fx);

    expect(data.fetch_meta.transfers_source).toBe('node_logs');
    expect(seen.some((c) => c.method === 'alchemy_getAssetTransfers')).toBe(false);
  });

  it('follows pageKey and flags truncation when the cap is hit with pages left', async () => {
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, k) => alchemyRow(offset + k + 10, OTHER, WALLET, '2026-10-06T00:00:00Z'));
    let inboundCalls = 0;
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const b = body(init);
      if (b?.method === 'eth_getBlockByNumber') return rpc(headAt(HEAD, 1));
      if (b?.method === 'alchemy_getAssetTransfers') {
        if (b.params[0].fromAddress) return rpc({ transfers: [] });
        inboundCalls++;
        expect(b.params[0].pageKey).toBe(inboundCalls === 1 ? undefined : `k${inboundCalls - 1}`);
        return rpc({ transfers: page(1000, inboundCalls * 1000), pageKey: `k${inboundCalls}` });
      }
      if (String(url).includes('acpx')) return new Response(JSON.stringify({ data: [] }));
      return rpc('0x0');
    }) as any;

    const fx = await fetchFixtures(WALLET, { sentinelRpc: ALCHEMY, fetchTimeoutMs: 2000 });

    expect(inboundCalls).toBe(2); // 2,000 rows = the cap; the third page is never read
    expect(fx.blockscout_transfers.items).toHaveLength(2000);
    expect(fx.blockscout_transfers.truncated).toBe(true);
  });
});

describe('mapAlchemyTransfers', () => {
  const T = (i: number, from: string, to: string | null): AlchemyRow => ({
    ...alchemyRow(i, from, to ?? '', `2026-10-0${i}T00:00:00Z`),
    to: to as string,
  });

  it('dedupes a self-transfer seen in both directions and orders newest first', () => {
    const self = T(2, WALLET, WALLET);
    const res = mapAlchemyTransfers([T(5, OTHER, WALLET), self, T(1, WALLET, OTHER), self], HEAD, 1_791_400_000);
    // i=1 sits on the newest block (HEAD - 1000), i=5 on the oldest.
    expect(res.items.map((t) => t.timestamp)).toEqual([
      '2026-10-01T00:00:00Z',
      '2026-10-02T00:00:00Z',
      '2026-10-05T00:00:00Z',
    ]);
    expect(res.items[0]).toEqual({
      from: { hash: WALLET },
      to: { hash: OTHER },
      timestamp: '2026-10-01T00:00:00Z',
      token: { address: USDC },
    });
    expect(res.truncated).toBe(false);
  });

  it('keeps the newest `cap` and flags truncation', () => {
    const res = mapAlchemyTransfers([T(1, OTHER, WALLET), T(2, OTHER, WALLET), T(3, OTHER, WALLET)], HEAD, 0, 2);
    expect(res.items.map((t) => t.timestamp)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
    expect(res.truncated).toBe(true);
  });

  it('drops rows with no recipient and dates rows without metadata from the head', () => {
    const headTs = 1_791_400_000;
    const noMeta = { ...T(3, OTHER, WALLET), metadata: undefined } as unknown as AlchemyRow;
    const res = mapAlchemyTransfers([T(1, OTHER, null), noMeta], HEAD, headTs);
    expect(res.items).toHaveLength(1);
    // 3,000 blocks behind the head at 2 s a block.
    expect(res.items[0]!.timestamp).toBe(new Date((headTs - 6000) * 1000).toISOString());
  });
});

describe('state reads: a failed balance read is never reported as a zero balance', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    _resetHeadCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _resetHeadCache();
  });

  it('records the failed read, does not fire or pass the balance checks, and marks them not assessed', async () => {
    const { impl } = upstreams({ logs: 'http_400', alchemy: 'ok_empty', blockscout: 403, usdc: 'throttled' });
    global.fetch = impl as any;
    const fx = await fetchFixtures(WALLET, { sentinelRpc: SENTINEL, fallbackRpc: PUBLIC_FALLBACK, alchemyRpc: ALCHEMY, fetchTimeoutMs: 2000 });
    const { data, assessment } = await decode(fx);

    expect(data.fetch_meta.state_unavailable).toEqual(['usdc_balance']);
    // The wallet holds 5,451 USDC; a throttled read must not become "holds 0".
    expect(data.balances.usdc.read).toBe(false);
    expect(assessment.flags.map((f) => f.id)).not.toContain('stranded_value');
    expect(assessment.not_assessed.join(' ')).toMatch(/USDC balance could not be read/);
  });

  it('with the balance read, the same wallet is dormant with stranded value', async () => {
    const { impl } = upstreams({ logs: 'http_400', alchemy: 'ok_empty', blockscout: 403, usdc: 'ok' });
    global.fetch = impl as any;
    const fx = await fetchFixtures(WALLET, { sentinelRpc: SENTINEL, fallbackRpc: PUBLIC_FALLBACK, alchemyRpc: ALCHEMY, fetchTimeoutMs: 2000 });
    const { data, assessment } = await decode(fx);
    expect(data.fetch_meta.state_unavailable).toBeUndefined();
    expect(data.balances.usdc.read).toBe(true);
    expect(assessment.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['dormant_wallet', 'stranded_value']));
  });
});
