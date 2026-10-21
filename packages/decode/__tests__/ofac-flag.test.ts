import { afterEach, describe, expect, it } from 'vitest';
import { RISK_CHECKS, deriveRiskFlags, riskChecksFor, withSanctionsFlag, type RiskAssessment } from '../src/risk-flags.js';
import { counterpartyVerdict } from '../src/verdict.js';
import { isAttestable } from '../src/attestation.js';
import type { QuickDecodeResultData } from '../src/types.js';

// A sanctions match is a fact about a US government list, not a reading of the
// chain: it needs no transfer read, runs on every chain, and always means Hold.

// Lazarus Group, Ronin Bridge exploit: on the SDN list under ETH.
const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';
const NORMAL = '0x1111111111111111111111111111111111111111';

function data(address: string, over: Partial<QuickDecodeResultData> = {}): QuickDecodeResultData {
  return {
    target: {
      input: address,
      wallet_address: address,
      handle: null,
      name: null,
      acp_id: null,
      virtuals_agent_id: null,
      framework: 'unknown',
      owner_address: null,
    },
    wallet: { type: 'eoa', nonce: 5, code_size: 0, is_virtuals_factory: false },
    balances: { eth: { wei: '1000000000000000', usd: 3 }, usdc: { amount: 10, usd: 10 }, agent_token: null },
    token_trading: null,
    activity: {
      latest_transfer_at: '2026-10-10T10:00:00Z',
      latest_transfer_age_hours: 2,
      transfers_24h: 12,
      transfers_7d: 30,
      transfers_30d: 40,
      unique_counterparties_30d: 9,
    },
    fetch_meta: { transfers_fetched: 40, transfers_truncated: false },
    claims: {
      agdp: null,
      revenue: null,
      successful_jobs: null,
      total_jobs: null,
      success_rate: null,
      last_active_at_acp: null,
      is_online_acp: null,
    },
    chain_reality: { active_today: true, active_7d: true, active_30d: true, settlement_path: [], payment_manager_seen: false },
    discrepancies: [],
    checks_performed: [],
    survival: { classification: 'active', rationale: '30 transfers in last 7d' },
    usdc_pattern: 'running',
    peers: { similar_active: [], similar_dormant: [], cluster: null, cluster_status: null },
    ...over,
  };
}

const EXPECTED_FLAG = {
  id: 'ofac_sanctioned',
  severity: 'high',
  title: 'On the US sanctions list (OFAC)',
  evidence: 'This address is on the US Treasury OFAC SDN list. Paying it may be illegal for US persons.',
  source: 'https://sanctionssearch.ofac.treas.gov/',
};

describe('the ofac_sanctioned check in the catalog', () => {
  it('is listed with a plain description, needs no transfer or state read, and is not Base-only', () => {
    const c = RISK_CHECKS.find((x) => x.id === 'ofac_sanctioned');
    expect(c).toMatchObject({ title: EXPECTED_FLAG.title, looks_for: 'The address appears on the US Treasury sanctions list' });
    expect(c!.reads_transfers).toBeUndefined();
    expect(c!.reads_state).toBeUndefined();
    expect(c!.base_only).toBeUndefined();
  });

  it('runs on every chain the check supports', () => {
    expect(riskChecksFor('base').map((c) => c.id)).toContain('ofac_sanctioned');
    expect(riskChecksFor('bsc', 14).map((c) => c.id)).toContain('ofac_sanctioned');
  });

  it('brings the catalog to 12 checks, with privacy_relay, known_label and poisoning_decoy', () => {
    expect(RISK_CHECKS).toHaveLength(12);
  });
});

describe('deriveRiskFlags and the OFAC list', () => {
  afterEach(() => {
    delete process.env.RISK_SELF_FLAG_ALLOWLIST;
  });

  it('raises ofac_sanctioned (high) for a listed address, whatever its letter case', () => {
    const r = deriveRiskFlags(data('0x098B716B8Aaf21512996dC57EB0615e2383E2f96'));
    expect(r.flags.find((f) => f.id === 'ofac_sanctioned')).toEqual(EXPECTED_FLAG);
    expect(r.band).toBe('high-signal');
  });

  it('raises it on BNB Chain too', () => {
    const r = deriveRiskFlags(data(SANCTIONED, { chain: 'bsc', fetch_meta: { transfers_fetched: 40, transfers_truncated: false, window_days: 14 } }));
    expect(r.flags.map((f) => f.id)).toContain('ofac_sanctioned');
  });

  it('does not raise it for an address that is not listed', () => {
    expect(deriveRiskFlags(data(NORMAL)).flags.map((f) => f.id)).not.toContain('ofac_sanctioned');
  });

  it('raises it when every transfer source failed and the head was stale: it reads neither', () => {
    const r = deriveRiskFlags(
      data(SANCTIONED, {
        fetch_meta: { transfers_fetched: 0, transfers_truncated: false, transfers_unavailable: 'Every transfer source failed', head_stale: true },
      }),
    );
    expect(r.flags.map((f) => f.id)).toEqual(['ofac_sanctioned']);
  });

  it('beats the self-flag allowlist: a list match is not ours to suppress', () => {
    process.env.RISK_SELF_FLAG_ALLOWLIST = SANCTIONED;
    expect(deriveRiskFlags(data(SANCTIONED)).flags.map((f) => f.id)).toEqual(['ofac_sanctioned']);
  });
});

describe('withSanctionsFlag (a stored report read after the list changed)', () => {
  const stored: RiskAssessment = {
    band: 'low-signal',
    flags: [{ id: 'activity_truncated', severity: 'info', title: 't', evidence: 'e', source: 's' }],
    not_assessed: ['x'],
    classifier_version: '1.0.0',
    signal_density: 0,
  };

  it('adds the flag first and recomputes the band', () => {
    const r = withSanctionsFlag(stored, SANCTIONED);
    expect(r.flags.map((f) => f.id)).toEqual(['ofac_sanctioned', 'activity_truncated']);
    expect(r.band).toBe('high-signal');
    expect(r.signal_density).toBe(6);
    expect(r.not_assessed).toEqual(['x']);
  });

  it('is idempotent and leaves an unlisted address untouched', () => {
    const once = withSanctionsFlag(stored, SANCTIONED);
    expect(withSanctionsFlag(once, SANCTIONED).flags.filter((f) => f.id === 'ofac_sanctioned')).toHaveLength(1);
    expect(withSanctionsFlag(stored, NORMAL)).toBe(stored);
  });
});

describe('counterpartyVerdict on a sanctioned address', () => {
  const ofac = { ...EXPECTED_FLAG, severity: 'high' as const };
  const assessment = { band: 'high-signal' as const, flags: [ofac] };
  const REASON = 'On the US sanctions list (OFAC): This address is on the US Treasury OFAC SDN list. Paying it may be illegal for US persons.';

  it('says Hold and names the sanctions match', () => {
    const v = counterpartyVerdict(assessment, { transfers_30d: 40, unique_counterparties_30d: 9, latest_transfer_age_hours: 2 });
    expect(v).toMatchObject({ label: 'hold', text: 'Hold', reason: REASON });
    expect(v.limits).toMatch(/OFAC/);
  });

  it("beats Couldn't check: the list needs no transfer read", () => {
    const v = counterpartyVerdict(assessment, null, { transfersUnavailable: true });
    expect(v).toMatchObject({ label: 'hold', text: 'Hold', reason: REASON });
  });

  it('beats Inactive and No track record', () => {
    const inactive = counterpartyVerdict(assessment, { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null, sent_tx_count: 43 });
    const fresh = counterpartyVerdict(assessment, { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null, sent_tx_count: 0 });
    const none = counterpartyVerdict(assessment, null);
    for (const v of [inactive, fresh, none]) expect(v).toMatchObject({ label: 'hold', text: 'Hold', reason: REASON });
  });

  it('names the sanctions match even when another high flag comes first', () => {
    const stranded = { id: 'stranded_value', severity: 'high' as const, title: 'USDC balance held in a dormant wallet', evidence: 'Holds 5 USDC', source: 's' };
    const v = counterpartyVerdict({ band: 'high-signal', flags: [stranded, ofac] }, null);
    expect(v.reason).toBe(REASON);
  });
});

describe('attestation and the OFAC flag', () => {
  const report = (flagIds: string[]) => ({ address: SANCTIONED, flagIds, generatedAt: new Date(), headStale: false });

  it('a list match alone does not put a report on-chain: attestations rest on observed behavior', () => {
    expect(isAttestable(report(['ofac_sanctioned']), new Set())).toBe(false);
  });

  it('a list match alongside a behavior flag is still attestable', () => {
    expect(isAttestable(report(['ofac_sanctioned', 'dormant_wallet']), new Set())).toBe(true);
  });
});
