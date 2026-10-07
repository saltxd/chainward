import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deriveRiskFlags } from '../src/risk-flags.js';
import { CLASSIFIER_VERSION } from '../src/types.js';
import type { QuickDecodeResultData, Discrepancy } from '../src/types.js';

const ADDR = '0x1111111111111111111111111111111111111111';

/**
 * Minimal, internally-consistent QuickDecodeResultData. Defaults raise NO flags
 * (active wallet, running USDC, EOA, many counterparties, no truncation).
 * Each test overrides only the fields that drive the flag under test.
 */
function baseData(overrides: Partial<QuickDecodeResultData> = {}): QuickDecodeResultData {
  const base: QuickDecodeResultData = {
    target: {
      input: ADDR,
      wallet_address: ADDR,
      handle: null,
      name: null,
      acp_id: null,
      virtuals_agent_id: null,
      framework: 'unknown',
      owner_address: null,
    },
    wallet: { type: 'eoa', nonce: 5, code_size: 0, is_virtuals_factory: false },
    balances: {
      eth: { wei: '1000000000000000', usd: 3 },
      usdc: { amount: 10, usd: 10 },
      agent_token: null,
    },
    token_trading: null,
    activity: {
      latest_transfer_at: '2026-04-30T10:00:00Z',
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
    chain_reality: {
      active_today: true,
      active_7d: true,
      active_30d: true,
      settlement_path: [],
      payment_manager_seen: false,
    },
    discrepancies: [],
    checks_performed: [],
    survival: { classification: 'active', rationale: '30 transfers in last 7d' },
    usdc_pattern: 'running',
    peers: { similar_active: [], similar_dormant: [], cluster: null, cluster_status: null },
  };
  return { ...base, ...overrides };
}

const onlineDiscrepancy: Discrepancy = {
  field: 'isOnline',
  acp_says: 'true',
  chain_says: 'no transfers in last 7 days',
  severity: 'warn',
};

// Neutral-lexicon discipline (mirrors report-writer.ts forbidden words).
const FORBIDDEN_LEXICON = /\b(scam|fake|rug|dirty|broken|fraud|theft|stolen)\b/i;

describe('deriveRiskFlags — structural invariants', () => {
  it('always returns a non-empty not_assessed[]', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.not_assessed.length).toBeGreaterThan(0);
    // even a maximally-flagged wallet keeps not_assessed populated
    const maxed = deriveRiskFlags(
      baseData({
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        usdc_pattern: 'graveyard',
        wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
        discrepancies: [onlineDiscrepancy],
        fetch_meta: { transfers_fetched: 50, transfers_truncated: true },
      }),
    );
    expect(maxed.not_assessed.length).toBeGreaterThan(0);
  });

  it('stamps the current classifier_version', () => {
    expect(deriveRiskFlags(baseData()).classifier_version).toBe(CLASSIFIER_VERSION);
  });

  it('only ever emits neutral bands', () => {
    const valid = new Set(['low-signal', 'mixed', 'elevated', 'high-signal']);
    const samples = [
      baseData(),
      baseData({ discrepancies: [onlineDiscrepancy] }),
      baseData({ usdc_pattern: 'graveyard', survival: { classification: 'dormant', rationale: 'x' } }),
    ];
    for (const s of samples) {
      expect(valid.has(deriveRiskFlags(s).band)).toBe(true);
    }
  });

  it('gives every flag non-empty evidence and a source URL', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        usdc_pattern: 'graveyard',
        wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
        discrepancies: [onlineDiscrepancy],
        peers: { similar_active: [], similar_dormant: [], cluster: 'cabal', cluster_status: 'collapsed' },
        fetch_meta: { transfers_fetched: 50, transfers_truncated: true },
      }),
    );
    expect(r.flags.length).toBeGreaterThan(0);
    for (const f of r.flags) {
      expect(f.evidence.trim().length).toBeGreaterThan(0);
      expect(f.source).toMatch(/^https?:\/\//);
    }
  });

  it('uses neutral lexicon in every title and evidence string', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        usdc_pattern: 'graveyard',
        wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
        discrepancies: [onlineDiscrepancy],
        peers: { similar_active: [], similar_dormant: [], cluster: 'cabal', cluster_status: 'collapsed' },
        fetch_meta: { transfers_fetched: 50, transfers_truncated: true },
      }),
    );
    for (const f of r.flags) {
      expect(f.title).not.toMatch(FORBIDDEN_LEXICON);
      expect(f.evidence).not.toMatch(FORBIDDEN_LEXICON);
    }
  });

  it('never emits a safety verdict band', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.band).not.toMatch(/safe|risky|clean|verified/i);
  });
});

describe('deriveRiskFlags — clean wallet', () => {
  it('raises no flags and lands low-signal for an active well-distributed wallet', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.flags).toHaveLength(0);
    expect(r.band).toBe('low-signal');
    expect(r.signal_density).toBe(0);
  });
});

describe('flag 1 — claim_vs_chain_offline', () => {
  it('fires when an isOnline discrepancy is present', () => {
    const r = deriveRiskFlags(baseData({ discrepancies: [onlineDiscrepancy] }));
    const f = r.flags.find((x) => x.id === 'claim_vs_chain_offline');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('medium');
    expect(f?.evidence).toContain('true');
  });

  it('does not fire without an isOnline discrepancy', () => {
    const r = deriveRiskFlags(
      baseData({ discrepancies: [{ field: 'lastActiveAt', acp_says: 'x', chain_says: 'y', severity: 'info' }] }),
    );
    expect(r.flags.find((x) => x.id === 'claim_vs_chain_offline')).toBeUndefined();
  });
});

describe('flag 2 — dormant_wallet', () => {
  it('fires when survival is dormant', () => {
    const r = deriveRiskFlags(
      baseData({ survival: { classification: 'dormant', rationale: 'no transfers in 7d' } }),
    );
    const f = r.flags.find((x) => x.id === 'dormant_wallet');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('medium');
  });

  it('does not fire when survival is active', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.flags.find((x) => x.id === 'dormant_wallet')).toBeUndefined();
  });
});

describe('flag 3 — stranded_value', () => {
  it('fires when usdc_pattern is graveyard and is high severity', () => {
    const r = deriveRiskFlags(
      baseData({
        usdc_pattern: 'graveyard',
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 500, usd: 500 }, agent_token: null },
      }),
    );
    const f = r.flags.find((x) => x.id === 'stranded_value');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('high');
    expect(r.band).toBe('high-signal');
  });

  it('does not fire when usdc_pattern is running', () => {
    const r = deriveRiskFlags(baseData({ usdc_pattern: 'running' }));
    expect(r.flags.find((x) => x.id === 'stranded_value')).toBeUndefined();
  });
});

describe('flag 4 — factory_proxy_clone', () => {
  it('fires when wallet is a Virtuals factory proxy (info severity)', () => {
    const r = deriveRiskFlags(
      baseData({ wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true } }),
    );
    const f = r.flags.find((x) => x.id === 'factory_proxy_clone');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('info');
  });

  it('does not fire for an EOA', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.flags.find((x) => x.id === 'factory_proxy_clone')).toBeUndefined();
  });
});

describe('flag 5 — counterparty_concentration', () => {
  it('fires when <=2 counterparties AND >=10 transfers in 30d', () => {
    const r = deriveRiskFlags(
      baseData({
        activity: {
          latest_transfer_at: '2026-04-30T10:00:00Z',
          latest_transfer_age_hours: 2,
          transfers_24h: 5,
          transfers_7d: 12,
          transfers_30d: 20,
          unique_counterparties_30d: 2,
        },
      }),
    );
    const f = r.flags.find((x) => x.id === 'counterparty_concentration');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('medium');
  });

  it('does not fire when counterparties are well distributed', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.flags.find((x) => x.id === 'counterparty_concentration')).toBeUndefined();
  });

  it('does not fire when transfer volume is below threshold', () => {
    const r = deriveRiskFlags(
      baseData({
        activity: {
          latest_transfer_at: '2026-04-30T10:00:00Z',
          latest_transfer_age_hours: 2,
          transfers_24h: 1,
          transfers_7d: 3,
          transfers_30d: 5,
          unique_counterparties_30d: 1,
        },
      }),
    );
    expect(r.flags.find((x) => x.id === 'counterparty_concentration')).toBeUndefined();
  });
});

describe('flag 6 — cluster_collapsed', () => {
  it('fires when peer cluster_status is collapsed', () => {
    const r = deriveRiskFlags(
      baseData({
        peers: { similar_active: [], similar_dormant: ['a', 'b'], cluster: 'cabal', cluster_status: 'collapsed' },
      }),
    );
    const f = r.flags.find((x) => x.id === 'cluster_collapsed');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('medium');
    expect(f?.evidence).toContain('cabal');
  });

  it('does not fire for an active cluster', () => {
    const r = deriveRiskFlags(
      baseData({
        peers: { similar_active: ['a'], similar_dormant: [], cluster: 'cabal', cluster_status: 'active' },
      }),
    );
    expect(r.flags.find((x) => x.id === 'cluster_collapsed')).toBeUndefined();
  });
});

describe('flag 7 — inactive_no_history', () => {
  it('fires when survival unknown AND no latest transfer', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'unknown', rationale: 'no transfers' },
        activity: {
          latest_transfer_at: null,
          latest_transfer_age_hours: null,
          transfers_24h: 0,
          transfers_7d: 0,
          transfers_30d: 0,
          unique_counterparties_30d: 0,
        },
      }),
    );
    const f = r.flags.find((x) => x.id === 'inactive_no_history');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('low');
  });

  it('does not fire when there is transfer history', () => {
    const r = deriveRiskFlags(
      baseData({ survival: { classification: 'unknown', rationale: 'x' } }),
    );
    // latest_transfer_at is non-null in baseData
    expect(r.flags.find((x) => x.id === 'inactive_no_history')).toBeUndefined();
  });
});

describe('flag 8 — activity_truncated', () => {
  it('fires when fetch_meta.transfers_truncated is true (info severity)', () => {
    const r = deriveRiskFlags(
      baseData({ fetch_meta: { transfers_fetched: 1000, transfers_truncated: true } }),
    );
    const f = r.flags.find((x) => x.id === 'activity_truncated');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('info');
  });

  it('does not fire when transfers are not truncated', () => {
    const r = deriveRiskFlags(baseData());
    expect(r.flags.find((x) => x.id === 'activity_truncated')).toBeUndefined();
  });
});

describe('band computation', () => {
  it('is high-signal when any high-severity flag is present', () => {
    const r = deriveRiskFlags(
      baseData({ usdc_pattern: 'graveyard', survival: { classification: 'dormant', rationale: 'x' } }),
    );
    expect(r.band).toBe('high-signal');
  });

  it('is mixed for a single medium/low flag', () => {
    const r = deriveRiskFlags(baseData({ discrepancies: [onlineDiscrepancy] }));
    // exactly one substantive flag
    expect(r.flags.filter((f) => f.severity === 'medium' || f.severity === 'low')).toHaveLength(1);
    expect(r.band).toBe('mixed');
  });

  it('is elevated for two or more medium/low flags', () => {
    const r = deriveRiskFlags(
      baseData({
        discrepancies: [onlineDiscrepancy],
        peers: { similar_active: [], similar_dormant: [], cluster: 'cabal', cluster_status: 'collapsed' },
      }),
    );
    expect(r.band).toBe('elevated');
  });

  it('is low-signal when only info flags are present', () => {
    const r = deriveRiskFlags(
      baseData({ wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true } }),
    );
    expect(r.flags.every((f) => f.severity === 'info')).toBe(true);
    expect(r.band).toBe('low-signal');
  });
});

describe('freshness belt-and-suspenders — head_stale suppression', () => {
  // A wallet that would trip every time-sensitive flag AND a structural one.
  const triggering = () =>
    baseData({
      survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
      usdc_pattern: 'graveyard',
      discrepancies: [onlineDiscrepancy],
      wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
    });

  it('suppresses dormancy / offline / stranded flags when the source head is stale', () => {
    const r = deriveRiskFlags({
      ...triggering(),
      fetch_meta: { transfers_fetched: 40, transfers_truncated: false, head_stale: true },
    });
    const ids = new Set(r.flags.map((f) => f.id));
    expect(ids.has('dormant_wallet')).toBe(false);
    expect(ids.has('stranded_value')).toBe(false);
    expect(ids.has('claim_vs_chain_offline')).toBe(false);
    // structural, head-age-independent flag still emits
    expect(ids.has('factory_proxy_clone')).toBe(true);
  });

  it('emits those same flags when the head is fresh (head_stale absent/false)', () => {
    const ids = new Set(deriveRiskFlags(triggering()).flags.map((f) => f.id));
    expect(ids.has('dormant_wallet')).toBe(true);
    expect(ids.has('stranded_value')).toBe(true);
    expect(ids.has('claim_vs_chain_offline')).toBe(true);
  });

  it('suppresses inactive_no_history under a stale head', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'unknown', rationale: 'x' },
        activity: {
          latest_transfer_at: null,
          latest_transfer_age_hours: null,
          transfers_24h: 0,
          transfers_7d: 0,
          transfers_30d: 0,
          unique_counterparties_30d: 0,
        },
        fetch_meta: { transfers_fetched: 0, transfers_truncated: false, head_stale: true },
      }),
    );
    expect(r.flags.find((f) => f.id === 'inactive_no_history')).toBeUndefined();
  });
});

describe('a failed transfer read never fires a flag that reads the transfer list', () => {
  const UNAVAILABLE = 'Every transfer source failed: public Base RPC logs (eth_getLogs: 400); Blockscout (blockscout transfers: 403).';
  // Inputs that would trip every transfer-reading flag, plus the two structural ones.
  const everything = (fetch_meta: QuickDecodeResultData['fetch_meta']) =>
    baseData({
      survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
      usdc_pattern: 'graveyard',
      discrepancies: [onlineDiscrepancy],
      wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
      peers: { similar_active: [], similar_dormant: [], cluster: 'cabal', cluster_status: 'collapsed' },
      activity: {
        latest_transfer_at: null,
        latest_transfer_age_hours: null,
        transfers_24h: 0,
        transfers_7d: 0,
        transfers_30d: 12,
        unique_counterparties_30d: 1,
      },
      fetch_meta,
    });

  it('raises only the structural flags when every transfer source failed', () => {
    const r = deriveRiskFlags(
      everything({ transfers_fetched: 0, transfers_truncated: true, transfers_unavailable: UNAVAILABLE }),
    );
    expect(r.flags.map((f) => f.id).sort()).toEqual(['cluster_collapsed', 'factory_proxy_clone']);
  });

  it('raises the same inputs normally once the read succeeds', () => {
    const r = deriveRiskFlags(everything({ transfers_fetched: 12, transfers_truncated: true }));
    expect(r.flags.map((f) => f.id).sort()).toEqual([
      'activity_truncated',
      'claim_vs_chain_offline',
      'cluster_collapsed',
      'counterparty_concentration',
      'dormant_wallet',
      'factory_proxy_clone',
      'stranded_value',
    ]);
  });

  it('never fires inactive_no_history on an unread window', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'unknown', rationale: 'Not assessed' },
        activity: {
          latest_transfer_at: null,
          latest_transfer_age_hours: null,
          transfers_24h: 0,
          transfers_7d: 0,
          transfers_30d: 0,
          unique_counterparties_30d: 0,
        },
        fetch_meta: { transfers_fetched: 0, transfers_truncated: false, transfers_unavailable: UNAVAILABLE },
      }),
    );
    expect(r.flags).toEqual([]);
  });

  it('leads not_assessed with the failed read, naming the sources', () => {
    const r = deriveRiskFlags(
      baseData({ fetch_meta: { transfers_fetched: 0, transfers_truncated: false, transfers_unavailable: UNAVAILABLE } }),
    );
    expect(r.not_assessed[0]).toContain('Recent transfer activity');
    expect(r.not_assessed[0]).toContain('Blockscout (blockscout transfers: 403)');
    expect(deriveRiskFlags(baseData()).not_assessed[0]).not.toContain('Recent transfer activity');
  });
});

describe('inactive_no_history names the source that served the transfer list', () => {
  const quiet = (fetch_meta: QuickDecodeResultData['fetch_meta']) =>
    deriveRiskFlags(
      baseData({
        survival: { classification: 'unknown', rationale: 'no transfers' },
        activity: {
          latest_transfer_at: null,
          latest_transfer_age_hours: null,
          transfers_24h: 0,
          transfers_7d: 0,
          transfers_30d: 0,
          unique_counterparties_30d: 0,
        },
        fetch_meta,
      }),
    ).flags.find((f) => f.id === 'inactive_no_history')!.evidence;

  it.each([
    ['node_logs', 'read from our own Base node.'],
    ['rpc_logs', 'read from public Base RPC logs.'],
    ['alchemy', "read from Alchemy's Base transfer index."],
    ['blockscout', 'read from Blockscout.'],
  ] as const)('%s', (transfers_source, phrase) => {
    expect(quiet({ transfers_fetched: 0, transfers_truncated: false, data_source: 'fallback', transfers_source })).toContain(
      phrase,
    );
  });

  it('keeps the old wording for reports filed before the transfer source was recorded', () => {
    expect(quiet({ transfers_fetched: 0, transfers_truncated: false, data_source: 'sentinel' })).toContain(
      'read from our own Base node.',
    );
  });
});

describe('self-flag guard (allowlist)', () => {
  const ORIGINAL = process.env.RISK_SELF_FLAG_ALLOWLIST;

  beforeEach(() => {
    process.env.RISK_SELF_FLAG_ALLOWLIST = ADDR.toUpperCase(); // case-insensitive match
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.RISK_SELF_FLAG_ALLOWLIST;
    else process.env.RISK_SELF_FLAG_ALLOWLIST = ORIGINAL;
  });

  it('suppresses all flags for an allowlisted address even with triggering data', () => {
    const r = deriveRiskFlags(
      baseData({
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        usdc_pattern: 'graveyard',
        wallet: { type: 'erc1967_proxy', nonce: 0, code_size: 45, is_virtuals_factory: true },
        discrepancies: [onlineDiscrepancy],
        peers: { similar_active: [], similar_dormant: [], cluster: 'cabal', cluster_status: 'collapsed' },
        fetch_meta: { transfers_fetched: 50, transfers_truncated: true },
      }),
    );
    expect(r.flags).toHaveLength(0);
    expect(r.band).toBe('low-signal');
    expect(r.signal_density).toBe(0);
    // integrity preserved even when suppressed
    expect(r.not_assessed.length).toBeGreaterThan(0);
  });

  it('does not suppress flags for a non-allowlisted address', () => {
    const r = deriveRiskFlags(
      baseData({
        target: {
          input: '0x2222222222222222222222222222222222222222',
          wallet_address: '0x2222222222222222222222222222222222222222',
          handle: null,
          name: null,
          acp_id: null,
          virtuals_agent_id: null,
          framework: 'unknown',
          owner_address: null,
        },
        survival: { classification: 'dormant', rationale: 'no transfers in 7d' },
        usdc_pattern: 'graveyard',
      }),
    );
    expect(r.flags.length).toBeGreaterThan(0);
  });
});
