import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFixtures } from '../src/data-fetch.js';

// Mock @chainward/decode so fetchCurrentBlock doesn't make real RPC calls
vi.mock('@chainward/decode', () => ({
  fetchCurrentBlock: vi.fn(async () => ({ number: 100, hash: '0xdeadbeef' })),
  quickDecode: vi.fn(),
}));

describe('fetchFixtures', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the full fixture shape on happy path', async () => {
    global.fetch = vi.fn(async (url: any) => {
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
        return new Response(JSON.stringify({ result: '0x363d3d373d' }));
      }
      return new Response('{}');
    }) as any;

    const result = await fetchFixtures('0x' + '1'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545',
    });

    expect(result.acp_details).toBeDefined();
    expect(result.blockscout_counters).toBeDefined();
    expect(result.blockscout_transfers).toBeDefined();
    expect(result.sentinel_code).toBeDefined();
    expect(result.sentinel_nonce).toBeDefined();
    expect(result.sentinel_block).toBeDefined();
    expect(result.sentinel_block).toEqual({ number: '0x64', hash: '0xdeadbeef' });
    // tokenAddress is null so geckoterminal should not be fetched
    expect(result.geckoterminal).toBeNull();
  });

  it('falls back gracefully when individual sources fail', async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('blockscout')) return new Response('error', { status: 500 });
      if (u.includes('acpx.virtuals.io')) return new Response(JSON.stringify({ data: [] }));
      return new Response(JSON.stringify({ result: '0x0' }));
    }) as any;

    const result = await fetchFixtures('0x' + '1'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545',
    });

    expect(result.blockscout_counters).toEqual({
      transactions_count: '0',
      token_transfers_count: '0',
    });
    expect(result.blockscout_transfers).toEqual({ items: [] });
    // sentinel sources should still succeed
    expect(result.sentinel_code).toEqual({ result: '0x0' });
    expect(result.sentinel_nonce).toEqual({ result: '0x0' });
  });

  it('skips geckoterminal fetch when no tokenAddress on acp_details', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('acpx.virtuals.io/api/agents?')) {
        return new Response(JSON.stringify({ data: [{ id: 42 }] }));
      }
      if (u.includes('acpx.virtuals.io/api/agents/42/details')) {
        return new Response(JSON.stringify({ data: { id: 42, tokenAddress: null } }));
      }
      return new Response(JSON.stringify({ transactions_count: '1', token_transfers_count: '0', items: [], result: '0x1' }));
    }) as any;
    global.fetch = fetchMock;

    const result = await fetchFixtures('0x' + '2'.repeat(40), {
      sentinelRpc: 'http://cw-sentinel:8545',
    });

    expect(result.geckoterminal).toBeNull();
    // geckoterminal URL should never have been called
    const calls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('geckoterminal'))).toBe(false);
  });
});
