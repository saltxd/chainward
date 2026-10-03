import { describe, expect, it, vi } from 'vitest';
import type { RpcFixtures } from '@chainward/decode';
import { redisFixtureCache, teaserStatsFromFixtures } from '../lib/riskChainFixtures';
import { buildCoverage } from '../lib/reportCoverage';
import { extractProvenance } from '../lib/reportProvenance';

const WALLET = '0xb709860b8a1ce20019f3786d6982f773912bd286';
const OTHER = '0x2222222222222222222222222222222222222222';

function bscFixtures(over: Partial<RpcFixtures> = {}): RpcFixtures {
  return {
    chain: 'bsc',
    acp_details: { data: null },
    blockscout_counters: { transactions_count: '42', token_transfers_count: '2' },
    blockscout_transfers: {
      items: [
        { from: { hash: OTHER }, to: { hash: WALLET }, timestamp: '2026-10-02T10:00:00.000Z', token: { address: '0xt1' } },
        { from: { hash: WALLET }, to: { hash: OTHER }, timestamp: '2026-10-03T09:00:00.000Z', token: { address: '0xt1' } },
      ],
      truncated: false,
    },
    sentinel_code: { result: '0x' },
    sentinel_nonce: { result: '0x2a' },
    sentinel_eth_balance: { result: '0x' + (15n * 10n ** 17n).toString(16) }, // 1.5 BNB
    sentinel_usdc_balance: { result: '0x' + (1234n * 10n ** 16n).toString(16) }, // 12.34 USDC @18
    stablecoin_balances: { USDC: '0x' + (1234n * 10n ** 16n).toString(16), USDT: '0x0' },
    geckoterminal: null,
    sentinel_block: { number: '0x1', hash: '0x2' },
    data_source: { rpc_role: 'public', head_number: 1, head_age_seconds: 1, head_stale: false },
    window: {
      days: 14,
      requested_days: 14,
      from_block: 1,
      to_block: 2,
      block_seconds: 0.45,
      source: 'rpc_logs',
      truncated: false,
      scanned_from_block: 1,
      rpc_url: 'https://rpc.sentio.xyz/bsc',
    },
    token_count: 3,
    token_count_lower_bound: false,
    fetched_at: '2026-10-03T12:00:00.000Z',
    ...over,
  };
}

describe('teaserStatsFromFixtures', () => {
  it('denominates balances in the chain native asset and 18-decimal USDC, excludes self from counterparties', () => {
    const stats = teaserStatsFromFixtures(WALLET, bscFixtures());
    expect(stats).toEqual({
      tx_count: 42,
      eth_balance: 1.5,
      usdc_balance: 12.34,
      token_count: 3,
      unique_counterparties_30d: 1,
      latest_transfer_at: '2026-10-03T09:00:00.000Z',
      is_acp_agent: false,
    });
  });

  it('is all zeros / null for an address with no footprint', () => {
    const stats = teaserStatsFromFixtures(
      WALLET,
      bscFixtures({
        blockscout_transfers: { items: [], truncated: false },
        sentinel_nonce: { result: '0x0' },
        sentinel_eth_balance: { result: '0x0' },
        stablecoin_balances: { USDC: '0x0', USDT: '0x0' },
        token_count: 0,
      }),
    );
    expect(stats.tx_count).toBe(0);
    expect(stats.eth_balance).toBe(0);
    expect(stats.usdc_balance).toBe(0);
    expect(stats.unique_counterparties_30d).toBe(0);
    expect(stats.latest_transfer_at).toBeNull();
  });
});

describe('redisFixtureCache', () => {
  it('maps the cache contract onto ioredis get / set EX', async () => {
    const redis = { get: vi.fn(async () => 'v'), set: vi.fn(async () => 'OK') };
    const cache = redisFixtureCache(redis as never);
    expect(await cache.get('k')).toBe('v');
    await cache.set('k', 'v', 600);
    expect(redis.set).toHaveBeenCalledWith('k', 'v', 'EX', 600);
  });
});

describe('chain-aware report payload helpers', () => {
  const bscReportData = {
    chain: 'bsc',
    wallet: { type: 'eoa', nonce: 42, code_size: 0, is_virtuals_factory: false },
    activity: {
      latest_transfer_at: '2026-10-03T09:00:00.000Z',
      latest_transfer_age_hours: 3,
      transfers_24h: 1,
      transfers_7d: 2,
      transfers_30d: 2,
      unique_counterparties_30d: 1,
    },
    fetch_meta: {
      transfers_fetched: 2,
      transfers_truncated: false,
      data_source: 'public',
      head_lag_seconds: 1,
      head_stale: false,
      window_days: 14,
      window_blocks: { from: 1, to: 2 },
    },
    survival: { classification: 'at_risk', rationale: '2 transfers in 7d' },
  };

  it('coverage lists only the checks that ran on bsc and states the scan window', () => {
    const cov = buildCoverage(bscReportData, [{ id: 'inactive_no_history' }])!;
    const ids = cov.checks.map((c) => c.id);
    expect(ids).not.toContain('claim_vs_chain_offline');
    expect(ids).not.toContain('factory_proxy_clone');
    expect(ids).not.toContain('cluster_collapsed');
    expect(ids).toContain('dormant_wallet');
    expect(cov.window.days).toBe(14);
    expect(cov.window.sent_tx_count).toBe(42);
  });

  it('coverage keeps the full catalog and no window days for a base report', () => {
    const { chain: _chain, ...baseData } = bscReportData;
    void _chain;
    const cov = buildCoverage(
      { ...baseData, fetch_meta: { transfers_fetched: 2, transfers_truncated: false } },
      [],
    )!;
    expect(cov.checks.map((c) => c.id)).toContain('claim_vs_chain_offline');
    expect(cov.window.days).toBeUndefined();
  });

  it('provenance passes the public-RPC role through', () => {
    expect(extractProvenance(bscReportData)).toEqual({ data_source: 'public', head_lag_seconds: 1 });
  });
});
