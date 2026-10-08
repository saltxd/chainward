export type Target =
  | { kind: 'address'; value: string }
  | { kind: 'handle'; value: string };

export type Framework = 'virtuals_acp' | 'olas' | 'eliza' | 'agentkit' | 'unknown';

export type WalletType = 'eoa' | 'erc1967_proxy' | 'erc4337' | 'contract' | 'unknown';

export type SurvivalClassification = 'active' | 'at_risk' | 'dormant' | 'unknown';

export type UsdcPattern = 'running' | 'accumulating' | 'graveyard' | 'inactive' | 'unknown';

export type ClusterStatus = 'collapsed' | 'active' | 'mixed' | null;

export type DiscrepancySeverity = 'info' | 'warn' | 'critical';

export interface Discrepancy {
  field: string;
  acp_says: string;
  chain_says: string;
  severity: DiscrepancySeverity;
  reason?: string;
}

export interface Source {
  label: string;
  url: string;
  block_number: number | null;
  block_hash: string | null;
  timestamp: string;
}

/** Chains the quick decode can run on. Mirrors RiskChainId in @chainward/common. */
export type DecodeChain = 'base' | 'bsc';

/**
 * Which kind of RPC served a report's `latest` reads.
 *   sentinel — our own Base node
 *   fallback — a public Base RPC, used because the sentinel was unfit
 *   public   — a public RPC on a chain where we run no node (BSC)
 */
export type DecodeDataSource = 'sentinel' | 'fallback' | 'public';

/**
 * Which source served a report's ERC-20 transfer list (separate from the RPC
 * that served the `latest` reads: on Base the two can differ).
 *   node_logs    — eth_getLogs on our own Base node
 *   rpc_logs     — eth_getLogs on a public RPC (the Base fallback, or BNB Chain)
 *   alchemy      — Alchemy's transfer index (alchemy_getAssetTransfers)
 *   blockscout   — Blockscout's token-transfers API
 *   explorer_api — BscScan's token-transfer API (Etherscan v2)
 */
export type TransferListSource = 'node_logs' | 'rpc_logs' | 'alchemy' | 'blockscout' | 'explorer_api';

export interface QuickDecodeResultData {
  /** Chain the decode ran on. Absent on reports filed before multi-chain (= base). */
  chain?: DecodeChain;
  target: {
    input: string;
    wallet_address: string;
    handle: string | null;
    name: string | null;
    acp_id: number | null;
    virtuals_agent_id: number | null;
    framework: Framework;
    owner_address: string | null;
  };
  wallet: {
    type: WalletType;
    nonce: number;
    code_size: number;
    is_virtuals_factory: boolean;
  };
  balances: {
    eth: { wei: string; usd: number };
    /** `read: false` means the balance call failed on every RPC and `amount` is a placeholder, not a reading. */
    usdc: { amount: number; usd: number; read?: boolean };
    agent_token: { symbol: string; amount: number; usd: number } | null;
  };
  token_trading: {
    contract_address: string;
    symbol: string;
    fdv_usd: number | null;
    volume_24h_usd: number | null;
    holder_count: number | null;
    source: 'geckoterminal' | 'virtuals_api' | 'blockscout';
    fetched_at: string;
  } | null;
  activity: {
    latest_transfer_at: string | null;
    latest_transfer_age_hours: number | null;
    transfers_24h: number;
    transfers_7d: number;
    transfers_30d: number;
    unique_counterparties_30d: number;
  };
  /** Provenance of the transfer fetch behind `activity` — so a capped count is never invisible. */
  fetch_meta: {
    transfers_fetched: number;
    transfers_truncated: boolean;
    /** Which RPC served the `latest` reads this report was built from. */
    data_source?: DecodeDataSource;
    /** Head age (seconds) of that source at fetch time. */
    head_lag_seconds?: number;
    /** Which source served the transfer list behind `activity`. */
    transfers_source?: TransferListSource;
    /**
     * Set when EVERY transfer source failed: the transfer list is unknown, not
     * empty, so activity, survival and every flag that claims an absence are not
     * assessed. Public-safe text naming each source and how it failed (never a URL).
     */
    transfers_unavailable?: string;
    /** State reads (balance, nonce, code) that failed on every RPC; the checks that read them are not assessed. */
    state_unavailable?: string[];
    /**
     * How far back the transfer scan ACTUALLY looked, in days. Set when the
     * window is narrower than the 30-day activity horizon (public-RPC chains),
     * so the report can state the limit instead of implying 30 days. May be
     * fractional when the scan stopped at its time budget.
     */
    window_days?: number;
    /** Days the scan was asked for, when it differs from `window_days`. */
    window_requested_days?: number;
    /** Block range the transfer scan covered, when read from eth_getLogs. */
    window_blocks?: { from: number; to: number };
    /**
     * True if the source head was stale beyond the freshness threshold. Should
     * never be true in a persisted report (the fetch fails loud first); when set,
     * time-sensitive flags (dormancy / no-recent-activity) are suppressed.
     */
    head_stale?: boolean;
  };
  claims: {
    agdp: number | null;
    revenue: number | null;
    successful_jobs: number | null;
    total_jobs: number | null;
    success_rate: number | null;
    last_active_at_acp: string | null;
    is_online_acp: boolean | null;
  };
  chain_reality: {
    active_today: boolean;
    active_7d: boolean;
    active_30d: boolean;
    settlement_path: string[];
    payment_manager_seen: boolean;
  };
  discrepancies: Discrepancy[];
  checks_performed: string[];
  survival: {
    classification: SurvivalClassification;
    rationale: string;
  };
  usdc_pattern: UsdcPattern;
  peers: {
    similar_active: string[];
    similar_dormant: string[];
    cluster: string | null;
    cluster_status: ClusterStatus;
  };
}

export type ReportSource = 'claude' | 'fallback';

export interface QuickDecodeResult {
  report: string;
  data: QuickDecodeResultData;
  sources: Source[];
  meta: {
    schema_version: string;
    classifier_version: string;
    tier: 'quick';
    pipeline_version: string;
    generated_at: string;
    as_of_block: { number: number; hash: string };
    target_input: string;
    job_id: string;
    disclosure: string;
    /**
     * Whether the markdown report came from claude --print (richer prose) or
     * the deterministic fallback template (used when claude was unavailable
     * or produced output that violated the H1 constraint).
     */
    report_source: ReportSource;
  };
}

export const SCHEMA_VERSION = '1.0.0';
export const CLASSIFIER_VERSION = '1.0.0';

/**
 * Canonical data-rights disclosure text. Used in TWO places that must stay
 * in sync:
 *   1. Every deliverable's `meta.disclosure` field (post-purchase record)
 *   2. The ACP offering description shown to buyers pre-purchase (Task 28)
 *
 * Both locations MUST reference this constant — never duplicate the string.
 * Buyer consent is granted by submitting the job, which means the same text
 * has to appear before and after payment.
 */
export const DISCLOSURE_TEXT =
  'Decode requests and results are stored by ChainWard and may inform aggregate intelligence. Individual buyer-target pairs are never disclosed.';
