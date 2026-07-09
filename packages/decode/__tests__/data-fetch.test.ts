import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _resetHeadCache } from '@chainward/common';
import { fetchFixtures, fetchBlockscoutTransfers, NodeStaleError } from '../src/data-fetch.js';

// Mock the sentinel-block module so fetchCurrentBlock doesn't make real RPC calls.
// (data-fetch now lives in @chainward/decode and imports fetchCurrentBlock from
// ./sentinel-block.js directly — so the mock targets that module, not the package
// barrel, which would otherwise clobber the very functions under test.)
vi.mock('../src/sentinel-block.js', () => ({
  fetchCurrentBlock: vi.fn(async () => ({ number: 100, hash: '0xdeadbeef' })),
  parseSentinelBlock: vi.fn(),
}));

/** JSON-RPC method of a mocked fetch POST body (freshness probe vs other sentinel calls). */
function rpcMethod(init: any): string | undefined {
  try {
    return init?.body ? JSON.parse(init.body).method : undefined;
  } catch {
    return undefined;
  }
}

/** A fresh eth_getBlockByNumber("latest") head — head age ~0 against the real clock. */
function freshHead() {
  return {
    result: { number: '0x' + (48_000_000).toString(16), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) },
  };
}

/** A stalled head: answers, but its timestamp is ~13.5 days behind tip. */
function staleHead() {
  const ts = Math.floor(Date.now() / 1000 - 13.5 * 24 * 3600);
  return { result: { number: '0x' + (47_806_437).toString(16), timestamp: '0x' + ts.toString(16) } };
}

describe('fetchFixtures', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    _resetHeadCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    _resetHeadCache();
  });

  it('returns the full fixture shape on happy path', async () => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io/api/agents?')) {
        return new Response(JSON.stringify({ data: [{ id: 129 }] }));
      }
      if (u.includes('acpx.virtuals.io/api/agents/129/details')) {
        return new Response(
          JSON.stringify({ data: { id: 129, name: 'Axelrod', tokenAddress: null } }),
        );
      }
      if (u.includes('blockscout.com/api/v2/addresses') && u.includes('/counters')) {
        return new Response(
          JSON.stringify({ transactions_count: '5', token_transfers_count: '10' }),
        );
      }
      if (u.includes('blockscout.com/api/v2/addresses') && u.includes('/token-transfers')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      // sentinel RPC POST — matches any cw-sentinel or localhost URL
      if (u.includes('cw-sentinel') || u.includes('localhost')) {
        if (rpcMethod(init) === 'eth_getBlockByNumber') return new Response(JSON.stringify(freshHead()));
        return new Response(JSON.stringify({ result: '0x363d3d373d' }));
      }
      return new Response('{}');
    }) as any;

    const result = await fetchFixtures('0x' + '1'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545', fetchTimeoutMs: 8000,
    });

    expect(result.acp_details).toBeDefined();
    expect(result.blockscout_counters).toBeDefined();
    expect(result.blockscout_transfers).toBeDefined();
    expect(result.sentinel_code).toBeDefined();
    expect(result.sentinel_nonce).toBeDefined();
    expect(result.sentinel_block).toBeDefined();
    expect(result.sentinel_block).toEqual({ number: '0x64', hash: '0xdeadbeef' });
    // fresh sentinel → data_source records the sentinel role
    expect(result.data_source.rpc_role).toBe('sentinel');
    expect(result.data_source.head_stale).toBe(false);
    // tokenAddress is null so geckoterminal should not be fetched
    expect(result.geckoterminal).toBeNull();
  });

  it('falls back gracefully when individual sources fail', async () => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('blockscout')) return new Response('error', { status: 500 });
      if (u.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
      if (rpcMethod(init) === 'eth_getBlockByNumber') return new Response(JSON.stringify(freshHead()));
      return new Response(JSON.stringify({ result: '0x0' }));
    }) as any;

    const result = await fetchFixtures('0x' + '1'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545', fetchTimeoutMs: 8000,
    });

    expect(result.blockscout_counters).toEqual({
      transactions_count: '0',
      token_transfers_count: '0',
    });
    expect(result.blockscout_transfers).toEqual({ items: [], truncated: false });
    // sentinel sources should still succeed
    expect(result.sentinel_code).toEqual({ result: '0x0' });
    expect(result.sentinel_nonce).toEqual({ result: '0x0' });
  });

  it('skips geckoterminal fetch when no tokenAddress on acp_details', async () => {
    const fetchMock = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io/api/agents?')) {
        return new Response(JSON.stringify({ data: [{ id: 42 }] }));
      }
      if (u.includes('acpx.virtuals.io/api/agents/42/details')) {
        return new Response(JSON.stringify({ data: { id: 42, tokenAddress: null } }));
      }
      if (rpcMethod(init) === 'eth_getBlockByNumber') return new Response(JSON.stringify(freshHead()));
      return new Response(JSON.stringify({ transactions_count: '1', token_transfers_count: '0', items: [], result: '0x1' }));
    }) as any;
    global.fetch = fetchMock;

    const result = await fetchFixtures('0x' + '2'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545', fetchTimeoutMs: 8000,
    });

    expect(result.geckoterminal).toBeNull();
    // geckoterminal URL should never have been called
    const calls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('geckoterminal'))).toBe(false);
  });
});

describe('fetchFixtures — freshness guard', () => {
  let originalFetch: typeof fetch;
  const addr = '0x' + '3'.repeat(40);

  beforeEach(() => {
    originalFetch = global.fetch;
    _resetHeadCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _resetHeadCache();
  });

  it('routes to the fallback RPC when the sentinel head is stale', async () => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
      if (u.includes('blockscout')) {
        return new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0', items: [] }));
      }
      if (rpcMethod(init) === 'eth_getBlockByNumber') {
        // stale sentinel, fresh fallback
        return new Response(JSON.stringify(u.includes('sentinel') ? staleHead() : freshHead()));
      }
      return new Response(JSON.stringify({ result: '0x0' }));
    }) as any;

    const result = await fetchFixtures(addr, {
      sentinelRpc: 'http://cw-sentinel:8545',
      fallbackRpc: 'http://fallback-rpc:8545',
      fetchTimeoutMs: 8000,
    });

    expect(result.data_source.rpc_role).toBe('fallback');
    expect(result.data_source.head_stale).toBe(false);
  });

  it('throws NodeStaleError when the sentinel is stale and no fallback is configured', async () => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
      if (u.includes('blockscout')) return new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0' }));
      if (rpcMethod(init) === 'eth_getBlockByNumber') return new Response(JSON.stringify(staleHead()));
      return new Response(JSON.stringify({ result: '0x0' }));
    }) as any;

    await expect(
      fetchFixtures(addr, { sentinelRpc: 'http://cw-sentinel:8545', fetchTimeoutMs: 8000 }),
    ).rejects.toBeInstanceOf(NodeStaleError);
  });

  it('throws NodeStaleError when both the sentinel and the fallback are stale', async () => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
      if (u.includes('blockscout')) return new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0' }));
      if (rpcMethod(init) === 'eth_getBlockByNumber') return new Response(JSON.stringify(staleHead()));
      return new Response(JSON.stringify({ result: '0x0' }));
    }) as any;

    await expect(
      fetchFixtures(addr, {
        sentinelRpc: 'http://cw-sentinel:8545',
        fallbackRpc: 'http://fallback-rpc:8545',
        fetchTimeoutMs: 8000,
      }),
    ).rejects.toBeInstanceOf(NodeStaleError);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('fetchBlockscoutTransfers — pagination', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const addr = '0x' + 'a'.repeat(40);

  it('follows next_page_params until exhausted and concatenates items', async () => {
    const pages = [
      {
        items: [
          { timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x1' } },
          { timestamp: isoAgo(2 * DAY_MS), from: { hash: '0x2' } },
        ],
        next_page_params: { block_number: 10, index: 1 },
      },
      { items: [{ timestamp: isoAgo(3 * DAY_MS), from: { hash: '0x3' } }], next_page_params: null },
    ];
    let call = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(pages[call++]))) as any;

    const res = await fetchBlockscoutTransfers(addr, 8000);

    expect(res.items).toHaveLength(3);
    expect(res.truncated).toBe(false);
    expect((global.fetch as any).mock.calls).toHaveLength(2);
  });

  it('stops once a page crosses the 30d window (no over-fetch)', async () => {
    const pages = [
      { items: [{ timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x1' } }], next_page_params: { x: 1 } },
      { items: [{ timestamp: isoAgo(40 * DAY_MS), from: { hash: '0x2' } }], next_page_params: { x: 2 } },
      { items: [{ timestamp: isoAgo(50 * DAY_MS), from: { hash: '0x3' } }], next_page_params: null },
    ];
    let call = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(pages[call++]))) as any;

    const res = await fetchBlockscoutTransfers(addr, 8000);

    // page 1 (recent) + page 2 (oldest item older than 30d → stop); page 3 never fetched
    expect((global.fetch as any).mock.calls).toHaveLength(2);
    expect(res.truncated).toBe(false);
    expect(res.items).toHaveLength(2);
  });

  it('sets truncated when the page cap is hit with more pages remaining', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [{ timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x1' } }],
            next_page_params: { block_number: 1, index: 1 },
          }),
        ),
    ) as any;

    const res = await fetchBlockscoutTransfers(addr, 8000);

    expect(res.truncated).toBe(true);
    expect((global.fetch as any).mock.calls.length).toBe(20);
  });

  it('throws if the first page fails', async () => {
    global.fetch = vi.fn(async () => new Response('err', { status: 500 })) as any;
    await expect(fetchBlockscoutTransfers(addr, 8000)).rejects.toThrow(/blockscout transfers/);
  });

  it('stops on an empty page even if a cursor is present (no spin)', async () => {
    const pages = [
      { items: [{ timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x1' } }], next_page_params: { x: 1 } },
      { items: [], next_page_params: { x: 2 } }, // empty page WITH a cursor
      { items: [{ timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x2' } }], next_page_params: { x: 3 } },
    ];
    let call = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(pages[call++]))) as any;

    const res = await fetchBlockscoutTransfers(addr, 8000);

    expect((global.fetch as any).mock.calls).toHaveLength(2); // stopped at the empty page
    expect(res.items).toHaveLength(1);
  });

  it('stops + flags truncated when an item has no parseable timestamp', async () => {
    const pages = [
      { items: [{ from: { hash: '0x1' } }], next_page_params: { x: 1 } }, // no timestamp
      { items: [{ timestamp: isoAgo(1 * DAY_MS), from: { hash: '0x2' } }], next_page_params: { x: 2 } },
    ];
    let call = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify(pages[call++]))) as any;

    const res = await fetchBlockscoutTransfers(addr, 8000);

    expect((global.fetch as any).mock.calls).toHaveLength(1); // stopped after the unparseable page
    expect(res.truncated).toBe(true);
  });
});
