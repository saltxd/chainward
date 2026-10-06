import { describe, expect, it } from 'vitest';
import { RISK_CHECKS, deriveRiskFlags, riskChecksFor } from '../src/risk-flags.js';
import type { QuickDecodeResultData } from '../src/types.js';

const ADDR = '0x2222222222222222222222222222222222222222';

// A dormant, graveyard-USDC factory clone with concentrated transfers, in a
// collapsed cluster, truncated fetch: raises most of the catalog at once.
function loudData(): QuickDecodeResultData {
  return {
    target: {
      input: ADDR,
      wallet_address: ADDR,
      handle: null,
      name: null,
      acp_id: null,
      virtuals_agent_id: null,
      framework: 'virtuals_acp',
      owner_address: null,
    },
    wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
    balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 120, usd: 120 }, agent_token: null },
    token_trading: null,
    activity: {
      latest_transfer_at: '2026-01-01T00:00:00Z',
      latest_transfer_age_hours: 5000,
      transfers_24h: 0,
      transfers_7d: 0,
      transfers_30d: 12,
      unique_counterparties_30d: 1,
    },
    fetch_meta: { transfers_fetched: 500, transfers_truncated: true },
    claims: {
      agdp: null,
      revenue: null,
      successful_jobs: null,
      total_jobs: null,
      success_rate: null,
      last_active_at_acp: null,
      is_online_acp: true,
    },
    chain_reality: {
      active_today: false,
      active_7d: false,
      active_30d: true,
      settlement_path: [],
      payment_manager_seen: false,
    },
    discrepancies: [{ field: 'isOnline', acp_says: 'online', chain_says: 'no activity 7d', severity: 'warn' }],
    checks_performed: [],
    survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
    usdc_pattern: 'graveyard',
    peers: { similar_active: [], similar_dormant: ['0xaa'], cluster: 'cohort-1', cluster_status: 'collapsed' },
  };
}

describe('RISK_CHECKS catalog', () => {
  it('lists every v1 check exactly once with a title and a description of what it looks for', () => {
    const ids = RISK_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      [
        'claim_vs_chain_offline',
        'dormant_wallet',
        'stranded_value',
        'factory_proxy_clone',
        'counterparty_concentration',
        'cluster_collapsed',
        'inactive_no_history',
        'activity_truncated',
      ].sort(),
    );
    for (const c of RISK_CHECKS) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.looks_for.length).toBeGreaterThan(0);
    }
  });

  it('is the source of the titles the classifier emits, so the two can never drift', () => {
    const byId = new Map<string, string>(RISK_CHECKS.map((c) => [c.id, c.title]));
    const { flags } = deriveRiskFlags(loudData());
    expect(flags.length).toBeGreaterThanOrEqual(6);
    for (const f of flags) expect(byId.get(f.id)).toBe(f.title);
  });

  it('uses the neutral lexicon — never a clearance word', () => {
    for (const c of RISK_CHECKS) {
      expect(`${c.title} ${c.looks_for}`).not.toMatch(/\b(safe|clean|verified|passed|clear)\b/i);
    }
  });
});

// Off Base the transfer scan is a bounded public-RPC window (14 days on BNB Chain),
// so the coverage copy must state that window, not Base's 30 days.
describe('riskChecksFor wording', () => {
  const looksFor = (checks: readonly { id: string; looks_for: string }[], id: string) =>
    checks.find((c) => c.id === id)!.looks_for;

  it('states the window actually scanned on BNB Chain', () => {
    const bsc = riskChecksFor('bsc', 14);
    expect(looksFor(bsc, 'counterparty_concentration')).toBe(
      'Ten or more transfers in the 14 days scanned across two or fewer counterparties',
    );
    expect(looksFor(bsc, 'inactive_no_history')).toBe('No ERC-20 transfers in the 14-day window read from public BNB Chain RPC logs');
    for (const c of bsc) expect(c.looks_for).not.toMatch(/30|roughly/);
  });

  it('states a scan that stopped early at the days it covered', () => {
    expect(looksFor(riskChecksFor('bsc', 4.63), 'counterparty_concentration')).toContain('the 4.6 days scanned');
  });

  it('says which stablecoin the stranded-value check reads on BNB Chain', () => {
    expect(looksFor(riskChecksFor('bsc', 14), 'stranded_value')).toBe(
      'A USDC balance sitting in a wallet classified dormant (USDT balances are not counted on BNB Chain yet)',
    );
  });

  it('keeps the Base wording on Base', () => {
    const base = riskChecksFor('base');
    expect(looksFor(base, 'counterparty_concentration')).toBe('Ten or more transfers in 30 days across two or fewer counterparties');
    expect(looksFor(base, 'inactive_no_history')).toBe('No ERC-20 transfers in the roughly 30-day window');
    expect(looksFor(base, 'stranded_value')).toBe('A USDC balance sitting in a wallet classified dormant');
  });
});

describe('counterparty_concentration evidence', () => {
  it('names the window scanned on BNB Chain', () => {
    const data = { ...loudData(), chain: 'bsc' as const, fetch_meta: { transfers_fetched: 500, transfers_truncated: true, window_days: 14 } };
    const f = deriveRiskFlags(data).flags.find((x) => x.id === 'counterparty_concentration')!;
    expect(f.evidence).toBe('12 transfers in 14 days across only 1 unique counterparties.');
  });

  it('keeps 30 days on Base', () => {
    const f = deriveRiskFlags(loudData()).flags.find((x) => x.id === 'counterparty_concentration')!;
    expect(f.evidence).toBe('12 transfers in 30 days across only 1 unique counterparties.');
  });
});
