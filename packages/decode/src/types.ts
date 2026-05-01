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

export interface QuickDecodeResultData {
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
    usdc: { amount: number; usd: number };
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
  };
}

export const SCHEMA_VERSION = '1.0.0';
export const CLASSIFIER_VERSION = '1.0.0';
export const DISCLOSURE_TEXT =
  'Decode requests and results are stored by ChainWard and may inform aggregate intelligence. Individual buyer-target pairs are never disclosed.';
