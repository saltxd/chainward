import { describe, it, expect } from 'vitest';
import { computeQuickDecodeData, type QuickDecodeInput } from '../src/quick-decode.js';
import { RISK_CHECKS, deriveRiskFlags, notAssessedFor, riskChecksFor } from '../src/risk-flags.js';

const WALLET = '0xb709860b8a1ce20019f3786d6982f773912bd286';
const NOW = new Date('2026-10-03T12:00:00Z');

/** Fixtures as fetchRpcFixtures produces them for BSC: no ACP, public RPC, bounded window. */
function bscInput(over: Partial<QuickDecodeInput['fixtures']> = {}, transfers: any[] = []): QuickDecodeInput {
  return {
    input: WALLET,
    wallet_address: WALLET,
    job_id: 'test',
    pipeline_version: 'test',
    now: NOW,
    chain: 'bsc',
    fixtures: {
      acp_details: { data: null },
      blockscout_counters: { transactions_count: '12', token_transfers_count: String(transfers.length) },
      blockscout_transfers: { items: transfers, truncated: false },
      sentinel_code: { result: '0x' },
      sentinel_nonce: { result: '0xc' },
      sentinel_eth_balance: { result: '0xde0b6b3a7640000' },
      // 250 USDC at 18 decimals
      sentinel_usdc_balance: { result: '0x' + (250n * 10n ** 18n).toString(16) },
      sentinel_block: { number: '0x' + (125_480_064).toString(16), hash: '0x' + 'cd'.repeat(32) },
      data_source: { rpc_role: 'public', head_number: 125_480_064, head_age_seconds: 1, head_stale: false },
      window: { days: 14, from_block: 122_792_000, to_block: 125_480_062 },
      ...over,
    },
  };
}

function xfer(hoursAgo: number, from: string, to: string) {
  return {
    from: { hash: from },
    to: { hash: to },
    timestamp: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    token: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
  };
}

describe('computeQuickDecodeData on bsc', () => {
  it('scales USDC by 18 decimals, stamps the chain + window, and cites the explorer', () => {
    const { data, sources, meta } = computeQuickDecodeData(bscInput());
    expect(data.chain).toBe('bsc');
    expect(data.balances.usdc.amount).toBe(250);
    expect(data.balances.eth.wei).toBe('1000000000000000000');
    expect(data.target.framework).toBe('unknown');
    expect(data.fetch_meta).toEqual({
      transfers_fetched: 0,
      transfers_truncated: false,
      data_source: 'public',
      head_lag_seconds: 1,
      head_stale: false,
      window_days: 14,
      window_blocks: { from: 122_792_000, to: 125_480_062 },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe(`https://bscscan.com/address/${WALLET}`);
    expect(sources[0]!.label).toContain('BNB Chain');
    expect(sources[0]!.label).toContain('14-day window');
    expect(meta.as_of_block.number).toBe(125_480_064);
  });

  it('records the requested window only when the scan fell short, and words it honestly', () => {
    const { data } = computeQuickDecodeData(
      bscInput({ window: { days: 4.634, requested_days: 14, from_block: 1, to_block: 2 } }),
    );
    expect(data.fetch_meta.window_days).toBe(4.63);
    expect(data.fetch_meta.window_requested_days).toBe(14);
    const r = deriveRiskFlags(data);
    const windowLine = r.not_assessed.find((s) => /transfer window/.test(s))!;
    expect(windowLine).toContain('4.6-day transfer window actually read');
    expect(windowLine).toContain('asked for 14 days');
    expect(r.flags.find((f) => f.id === 'inactive_no_history')!.evidence).toContain('the last 4.6 days');
  });

  it('does not stamp `chain` on a Base decode so existing report shapes are unchanged', () => {
    const { data } = computeQuickDecodeData({ ...bscInput(), chain: 'base' });
    expect('chain' in data).toBe(false);
    expect(data.target.framework).toBe('virtuals_acp');
    // Base USDC is 6 decimals: the same raw value reads as a huge number, which is the point —
    // the chain decides the scale.
    expect(data.balances.usdc.amount).toBe(250e12);
  });
});

describe('deriveRiskFlags on bsc', () => {
  it('skips the Base-only checks even when their inputs would fire', () => {
    const { data } = computeQuickDecodeData(bscInput());
    const loud = {
      ...data,
      wallet: { ...data.wallet, is_virtuals_factory: true, type: 'erc1967_proxy' as const },
      discrepancies: [{ field: 'isOnline', acp_says: 'online', chain_says: 'no activity', severity: 'warn' as const }],
      peers: { ...data.peers, cluster: 'x', cluster_status: 'collapsed' as const },
    };
    const ids = deriveRiskFlags(loud).flags.map((f) => f.id);
    expect(ids).not.toContain('claim_vs_chain_offline');
    expect(ids).not.toContain('factory_proxy_clone');
    expect(ids).not.toContain('cluster_collapsed');
  });

  it('calls a wallet holding USDC with nothing moved in 14 days dormant with stranded value, citing BscScan', () => {
    const { data } = computeQuickDecodeData(bscInput());
    const r = deriveRiskFlags(data);
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain('dormant_wallet');
    expect(ids).toContain('stranded_value');
    expect(ids).not.toContain('inactive_no_history');
    expect(r.flags.find((f) => f.id === 'stranded_value')!.source).toBe(`https://bscscan.com/address/${WALLET}`);
  });

  it('raises inactive_no_history with the real window and a BscScan citation when nothing moved and nothing is held', () => {
    const { data } = computeQuickDecodeData(bscInput({ sentinel_usdc_balance: { result: '0x0' } }));
    const r = deriveRiskFlags(data);
    const flag = r.flags.find((f) => f.id === 'inactive_no_history');
    expect(flag).toBeDefined();
    expect(flag!.evidence).toContain('the last 14 days');
    expect(flag!.evidence).toContain('public BNB Chain RPC logs');
    expect(flag!.source).toBe(`https://bscscan.com/address/${WALLET}`);
  });

  it('still raises the chain-agnostic flags (dormant + stranded USDC) from the same inputs', () => {
    const { data } = computeQuickDecodeData(bscInput({}, [xfer(400, WALLET, '0x' + 'a'.repeat(40))]));
    const r = deriveRiskFlags(data);
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain('dormant_wallet');
    expect(ids).toContain('stranded_value');
    expect(r.flags.find((f) => f.id === 'stranded_value')!.evidence).toContain('250 USDC');
    expect(r.band).toBe('high-signal');
  });

  it('lists the Base-only sources and the bounded window under not_assessed', () => {
    const { data } = computeQuickDecodeData(bscInput());
    const na = deriveRiskFlags(data).not_assessed;
    expect(na.some((s) => /14-day transfer window/.test(s) && /BNB Chain/.test(s))).toBe(true);
    expect(na.some((s) => /Virtuals ACP/.test(s))).toBe(true);
    expect(na.some((s) => /Peer cluster/.test(s))).toBe(true);
    expect(na.some((s) => /attestation/i.test(s) && /EAS/.test(s))).toBe(true);
    expect(na.some((s) => /30-day activity window/.test(s))).toBe(false);
    // Base keeps the original list verbatim.
    expect(notAssessedFor('base', data.fetch_meta)).toContain(
      'Anything older than the 30-day activity window or beyond the transfer-page cap',
    );
  });

  it('describes a truncated RPC scan as a cap/budget stop, not a page cap', () => {
    const { data } = computeQuickDecodeData(
      bscInput({ blockscout_transfers: { items: [xfer(1, WALLET, '0x' + 'b'.repeat(40))], truncated: true } }),
    );
    const flag = deriveRiskFlags(data).flags.find((f) => f.id === 'activity_truncated');
    expect(flag!.evidence).toContain('time budget');
    expect(flag!.evidence).toContain('after covering 14 days');
  });
});

describe('riskChecksFor', () => {
  it('returns the full catalog for base and drops the base-only checks for bsc', () => {
    expect(riskChecksFor('base')).toBe(RISK_CHECKS);
    expect(riskChecksFor(undefined)).toBe(RISK_CHECKS);
    const bsc = riskChecksFor('bsc').map((c) => c.id);
    expect(bsc).toEqual([
      'dormant_wallet',
      'stranded_value',
      'counterparty_concentration',
      'inactive_no_history',
      'activity_truncated',
    ]);
  });
});
