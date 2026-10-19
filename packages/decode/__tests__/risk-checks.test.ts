import { describe, expect, it } from 'vitest';
import { RISK_CHECKS, deriveRiskFlags, riskChecksFor, withListFlags, type RiskAssessment } from '../src/risk-flags.js';
import { isAttestable } from '../src/attestation.js';
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
        'ofac_sanctioned',
        'claim_vs_chain_offline',
        'dormant_wallet',
        'stranded_value',
        'factory_proxy_clone',
        'counterparty_concentration',
        'cluster_collapsed',
        'inactive_no_history',
        'activity_truncated',
        'privacy_relay',
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

// px402 (PRXVT) on Base: a relayer pays sellers from its own USDC for agents it
// does not name. The match is a lookup in a hand-kept list, like the OFAC one: it
// reads nothing from the chain and is recorded as a fact, not a risk signal.
describe('the privacy_relay check', () => {
  const RELAYER_A = '0x6f890cc63aa57da9695528c9f5e3434897b32b8e';
  const RESERVE = '0xdd31c57e8f7cac78090a516292f0c9dea6c6119f';
  const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';
  const at = (address: string, over: Partial<QuickDecodeResultData> = {}): QuickDecodeResultData => {
    const d = loudData();
    return { ...d, target: { ...d.target, input: address, wallet_address: address }, ...over };
  };
  const ids = (a: { flags: { id: string }[] }) => a.flags.map((f) => f.id);

  it('is in the catalog as a Base-only check that reads nothing from the chain', () => {
    const c = RISK_CHECKS.find((x) => x.id === 'privacy_relay')!;
    expect(c).toMatchObject({ title: 'Pays for others through a privacy pool (px402)', base_only: true });
    expect(c.reads_transfers).toBeUndefined();
    expect(c.reads_state).toBeUndefined();
    expect(riskChecksFor('base').map((x) => x.id)).toContain('privacy_relay');
    expect(riskChecksFor('bsc', 14).map((x) => x.id)).not.toContain('privacy_relay');
  });

  it('raises an info flag for a known relayer on Base, naming it, and leaves the band alone', () => {
    const plain = deriveRiskFlags(loudData());
    const r = deriveRiskFlags(at(RELAYER_A.toUpperCase().replace('0X', '0x')));
    expect(r.flags.find((f) => f.id === 'privacy_relay')).toEqual({
      id: 'privacy_relay',
      severity: 'info',
      title: 'Pays for others through a privacy pool (px402)',
      evidence:
        'This is px402 relayer A (PRXVT). It pays x402 sellers from its own USDC for agents that deposited into the px402 pool, so the agent behind a payment does not appear on chain.',
      source: 'https://basescan.org/tx/0xf48758770e9633cda7ca261ef59c41aecdad0023c8164b9b95e8f1175e8fdeaf',
    });
    expect(r.band).toBe(plain.band);
    expect(r.signal_density).toBe(plain.signal_density);
  });

  it('describes the reserve contract as the pool itself', () => {
    const f = deriveRiskFlags(at(RESERVE)).flags.find((x) => x.id === 'privacy_relay')!;
    expect(f.evidence).toBe(
      'This is the px402 reserve contract (PRXVT). Agents deposit into it and PRXVT relayers pay sellers for them, so the agent behind a payment does not appear on chain.',
    );
  });

  it('raises it when every transfer source failed: it reads none', () => {
    const r = deriveRiskFlags(at(RELAYER_A, { fetch_meta: { transfers_fetched: 0, transfers_truncated: false, transfers_unavailable: 'Every transfer source failed', head_stale: true } }));
    expect(ids(r)).toContain('privacy_relay');
  });

  it('does not raise it off Base or for any other address', () => {
    expect(ids(deriveRiskFlags(at(RELAYER_A, { chain: 'bsc', fetch_meta: { transfers_fetched: 500, transfers_truncated: true, window_days: 14 } })))).not.toContain('privacy_relay');
    expect(ids(deriveRiskFlags(loudData()))).not.toContain('privacy_relay');
  });

  describe('withListFlags (a stored report read after the lists changed)', () => {
    const stored: RiskAssessment = {
      band: 'low-signal',
      flags: [{ id: 'activity_truncated', severity: 'info', title: 't', evidence: 'e', source: 's' }],
      not_assessed: ['x'],
      classifier_version: '1.0.0',
      signal_density: 0,
    };

    it('adds the relay flag to a report filed before the address was on the list', () => {
      const r = withListFlags(stored, RELAYER_A, 'base');
      expect(ids(r)).toEqual(['privacy_relay', 'activity_truncated']);
      expect(r.band).toBe('low-signal');
      expect(r.not_assessed).toEqual(['x']);
    });

    it('keeps a sanctions match first', () => {
      expect(ids(withListFlags(stored, SANCTIONED, 'base'))).toEqual(['ofac_sanctioned', 'activity_truncated']);
      const both = withListFlags({ ...stored, flags: [{ id: 'ofac_sanctioned', severity: 'high', title: 'o', evidence: 'e', source: 's' }, ...stored.flags] }, RELAYER_A, 'base');
      expect(ids(both)).toEqual(['ofac_sanctioned', 'privacy_relay', 'activity_truncated']);
    });

    it('is idempotent, Base only, and leaves an unlisted address untouched', () => {
      const once = withListFlags(stored, RELAYER_A, 'base');
      expect(ids(withListFlags(once, RELAYER_A, 'base')).filter((id) => id === 'privacy_relay')).toHaveLength(1);
      expect(withListFlags(stored, RELAYER_A, 'bsc')).toBe(stored);
      expect(withListFlags(stored, ADDR, 'base')).toBe(stored);
    });
  });

  it('never puts a report on-chain by itself: attestations rest on observed behavior', () => {
    const report = (flagIds: string[]) => ({ address: RELAYER_A, flagIds, generatedAt: new Date(), headStale: false });
    expect(isAttestable(report(['privacy_relay']), new Set())).toBe(false);
    expect(isAttestable(report(['privacy_relay', 'dormant_wallet']), new Set())).toBe(true);
  });
});
