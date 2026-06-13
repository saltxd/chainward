import type { QuickDecodeResultData, Discrepancy } from './types.js';
import { CLASSIFIER_VERSION } from './types.js';

/**
 * Risk-Check v1 flag derivation.
 *
 * deriveRiskFlags is a PURE function over an already-computed QuickDecodeResultData.
 * It does NOT invoke Claude / writeReport — flags are derived deterministically from
 * the classifier output, so the queue worker can produce a report in the hot path
 * without the prose step.
 *
 * INTEGRITY (non-negotiable, enforced here in code):
 *   1. NEVER emits a safety verdict. Bands are neutral descriptors of signal volume,
 *      not safe/risky. Zero flags => the neutral "no flags raised" copy, never "safe".
 *   2. not_assessed[] is required, non-empty, and hardcoded — the report can never
 *      imply it checked something it did not.
 *   3. Every flag carries `evidence` + a `source` URL (Blockscout / ACP / BaseScan).
 *   4. Neutral lexicon only — no "scam / fake / rug / dirty" in any title or evidence
 *      (mirrors report-writer.ts voice discipline).
 *   5. Self-flag guard: a known-good allowlist suppresses flags for ChainWard's own
 *      wallets + known infra so the platform never false-flags itself.
 */

export type RiskBand = 'low-signal' | 'mixed' | 'elevated' | 'high-signal';

export type RiskSeverity = 'info' | 'low' | 'medium' | 'high';

export interface RiskFlag {
  /** Stable machine id (see the 8 v1 flags). Used for dedupe + UI keys. */
  id: string;
  severity: RiskSeverity;
  /** Neutral, human-readable headline. No accusatory lexicon. */
  title: string;
  /** Concrete on-chain / ACP evidence backing the flag. Never empty. */
  evidence: string;
  /** Citation URL (Blockscout / ACP / BaseScan), block-stamped where possible. */
  source: string;
}

export interface RiskAssessment {
  /** Neutral band describing signal volume — NEVER a safety verdict. */
  band: RiskBand;
  flags: RiskFlag[];
  /** Required + always non-empty. Always rendered. */
  not_assessed: string[];
  classifier_version: string;
  /**
   * Internal-only numeric used for library sorting. This is NOT a safety rating
   * and MUST NOT be rendered to users as a score/grade/percentage. The UI shows
   * flag counts by severity + the neutral band, never this number.
   */
  signal_density: number;
}

/**
 * Things v1 explicitly does NOT assess. Required by the integrity rules to be
 * non-empty and always rendered, so absence of a flag is never read as a clearance.
 */
const NOT_ASSESSED: readonly string[] = [
  'Contract bytecode or source auditing',
  'Social-engineering or off-chain reputation',
  'Token approval / allowance drain exposure',
  'Upgradeability or admin-key control beyond proxy shape',
  'Internal contract-to-contract value flow',
  'Anything older than the 30-day activity window or beyond the transfer-page cap',
];

/**
 * Known-good allowlist (self-flag guard). Addresses here are ChainWard's own
 * wallets + known infra; they never receive flags. Lowercased for comparison.
 *
 * Populate via env (comma-separated) so deploys can extend it without a code
 * change. Kept as a hook rather than hardcoded node identities.
 */
function loadAllowlist(): Set<string> {
  const raw = process.env.RISK_SELF_FLAG_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0),
  );
}

function isAllowlisted(address: string, allowlist: Set<string>): boolean {
  return allowlist.has(address.toLowerCase());
}

/** Severity weights for the internal signal_density sort key (NOT a safety score). */
const SEVERITY_WEIGHT: Record<RiskSeverity, number> = {
  info: 0,
  low: 1,
  medium: 3,
  high: 6,
};

/**
 * Neutral band purely from the volume/severity of raised flags. Describes how
 * much signal the on-chain window surfaced — explicitly not safe/risky.
 *   - high-signal: at least one high-severity flag
 *   - elevated:    two or more medium/low flags (concentrated signal)
 *   - mixed:       a single non-info flag
 *   - low-signal:  only info flags, or none
 */
function computeBand(flags: RiskFlag[]): RiskBand {
  if (flags.some((f) => f.severity === 'high')) return 'high-signal';
  const substantive = flags.filter((f) => f.severity === 'medium' || f.severity === 'low');
  if (substantive.length >= 2) return 'elevated';
  if (substantive.length === 1) return 'mixed';
  return 'low-signal';
}

function blockscoutAddressUrl(address: string): string {
  return `https://base.blockscout.com/address/${address}`;
}

function findDiscrepancy(discrepancies: Discrepancy[], field: string): Discrepancy | undefined {
  return discrepancies.find((d) => d.field === field);
}

/**
 * Derive the v1 risk flags from a computed QuickDecodeResultData.
 *
 * Pure: no I/O, no Claude, no clock reads (block/freshness stamping is the
 * caller's job, using meta.as_of_block + generated_at).
 */
export function deriveRiskFlags(data: QuickDecodeResultData): RiskAssessment {
  const address = data.target.wallet_address;
  const allowlist = loadAllowlist();
  const source = blockscoutAddressUrl(address);

  // Self-flag guard: ChainWard's own wallets + known infra never get flagged.
  if (isAllowlisted(address, allowlist)) {
    return {
      band: 'low-signal',
      flags: [],
      not_assessed: [...NOT_ASSESSED],
      classifier_version: CLASSIFIER_VERSION,
      signal_density: 0,
    };
  }

  const flags: RiskFlag[] = [];

  // 1. claim_vs_chain_offline (medium) <- discrepancies[] entry field 'isOnline'
  const onlineDisc = findDiscrepancy(data.discrepancies, 'isOnline');
  if (onlineDisc) {
    flags.push({
      id: 'claim_vs_chain_offline',
      severity: 'medium',
      title: 'ACP online claim not reflected on-chain',
      evidence: `ACP reports ${onlineDisc.acp_says}; chain shows ${onlineDisc.chain_says}.`,
      source: 'https://app.virtuals.io/acp',
    });
  }

  // 2. dormant_wallet (medium) <- data.survival.classification === 'dormant'
  if (data.survival.classification === 'dormant') {
    flags.push({
      id: 'dormant_wallet',
      severity: 'medium',
      title: 'Wallet is dormant',
      evidence: data.survival.rationale,
      source,
    });
  }

  // 3. stranded_value (high) <- data.usdc_pattern === 'graveyard'
  if (data.usdc_pattern === 'graveyard') {
    flags.push({
      id: 'stranded_value',
      severity: 'high',
      title: 'USDC balance held in a dormant wallet',
      evidence: `Holds ${data.balances.usdc.amount} USDC while classified dormant (no transfers in the 7-day window).`,
      source,
    });
  }

  // 4. factory_proxy_clone (info) <- data.wallet.is_virtuals_factory === true
  if (data.wallet.is_virtuals_factory === true) {
    flags.push({
      id: 'factory_proxy_clone',
      severity: 'info',
      title: 'Virtuals factory proxy clone',
      evidence: `Wallet code is a Virtuals factory minimal-proxy (type ${data.wallet.type}, code size ${data.wallet.code_size} bytes).`,
      source,
    });
  }

  // 5. counterparty_concentration (medium)
  //    <- unique_counterparties_30d <= 2 AND transfers_30d >= 10
  if (
    data.activity.unique_counterparties_30d <= 2 &&
    data.activity.transfers_30d >= 10
  ) {
    flags.push({
      id: 'counterparty_concentration',
      severity: 'medium',
      title: 'Transfers concentrated among very few counterparties',
      evidence: `${data.activity.transfers_30d} transfers in 30 days across only ${data.activity.unique_counterparties_30d} unique counterparties.`,
      source,
    });
  }

  // 6. cluster_collapsed (medium) <- data.peers.cluster_status === 'collapsed'
  if (data.peers.cluster_status === 'collapsed') {
    flags.push({
      id: 'cluster_collapsed',
      severity: 'medium',
      title: 'Peer cluster is largely dormant',
      evidence: `Cluster "${data.peers.cluster ?? 'unknown'}" is classified collapsed (majority of cohort members dormant).`,
      source,
    });
  }

  // 7. inactive_no_history (low) <- survival 'unknown' AND latest_transfer_at === null
  if (
    data.survival.classification === 'unknown' &&
    data.activity.latest_transfer_at === null
  ) {
    flags.push({
      id: 'inactive_no_history',
      severity: 'low',
      title: 'No ERC-20 transfer history found',
      evidence: 'No ERC-20 transfers found in the checked window; survival could not be classified.',
      source,
    });
  }

  // 8. activity_truncated (info) <- data.fetch_meta.transfers_truncated === true
  //    Transparency, not risk — the counts are a lower bound.
  if (data.fetch_meta.transfers_truncated === true) {
    flags.push({
      id: 'activity_truncated',
      severity: 'info',
      title: 'Transfer history truncated at fetch cap',
      evidence: `Fetched ${data.fetch_meta.transfers_fetched} transfers and hit the page cap; activity counts are a lower bound, not a lifetime total.`,
      source,
    });
  }

  const signal_density = flags.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);

  return {
    band: computeBand(flags),
    flags,
    not_assessed: [...NOT_ASSESSED],
    classifier_version: CLASSIFIER_VERSION,
    signal_density,
  };
}
