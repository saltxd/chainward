const API_BASE = '';

class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const code = data.error?.code ?? 'UNKNOWN';
    const message = data.error?.message ?? 'Request failed';
    throw new ApiError(message, code);
  }

  return data as T;
}

export { ApiError };

export const api = {
  // Stats
  getOverview: () => fetchApi<{ success: true; data: FleetOverview }>('/api/stats/overview'),
  getAgentStats: (id: number) => fetchApi<{ success: true; data: AgentStats }>(`/api/stats/agents/${id}`),

  // Agents
  getAgents: () => fetchApi<{ success: true; data: Agent[] }>('/api/agents'),
  getAgent: (id: number) => fetchApi<{ success: true; data: Agent }>(`/api/agents/${id}`),
  createAgent: (body: CreateAgentBody) =>
    fetchApi<{ success: true; data: Agent }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAgent: (id: number, body: UpdateAgentBody) =>
    fetchApi<{ success: true; data: Agent }>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAgent: (id: number) =>
    fetchApi<{ success: true }>(`/api/agents/${id}`, { method: 'DELETE' }),
  getAgentEvents: (id: number, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<{ success: true; data: AgentEvent[] }>(`/api/agents/${id}/events${qs}`);
  },

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<TxListResponse>(`/api/transactions${qs}`);
  },
  getTxStats: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<{ success: true; data: TxVolumeBucket[] }>(`/api/transactions/stats${qs}`);
  },

  // Balances
  getLatestBalances: () => fetchApi<{ success: true; data: BalanceEntry[] }>('/api/balances/latest'),
  getBalanceHistory: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi<{ success: true; data: BalanceHistoryBucket[] }>(`/api/balances/history?${qs}`);
  },

  // Gas
  getGasAnalytics: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<{ success: true; data: GasBucket[] }>(`/api/gas/analytics${qs}`);
  },

  // Alerts
  getAlerts: () => fetchApi<{ success: true; data: AlertConfig[] }>('/api/alerts'),
  createAlert: (body: CreateAlertBody) =>
    fetchApi<{ success: true; data: AlertConfig }>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAlert: (id: number, body: Record<string, unknown>) =>
    fetchApi<{ success: true; data: AlertConfig }>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAlert: (id: number) =>
    fetchApi<{ success: true }>(`/api/alerts/${id}`, { method: 'DELETE' }),
  testAlert: (id: number) =>
    fetchApi<{ success: true; data: { message: string } }>(`/api/alerts/${id}/test`, {
      method: 'POST',
    }),
  getAlertEvents: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<AlertEventsResponse>(`/api/alerts/events${qs}`);
  },

  // API Keys
  getApiKeys: () => fetchApi<{ success: true; data: ApiKey[] }>('/api/keys'),
  createApiKey: (body: CreateApiKeyBody) =>
    fetchApi<{ success: true; data: ApiKeyWithRawKey }>('/api/keys', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeApiKey: (id: number) =>
    fetchApi<{ success: true }>(`/api/keys/${id}`, { method: 'DELETE' }),

  // Payments
  verifyPayment: (body: { txHash: string; plan: string }) =>
    fetchApi<{ success: true; plan: string; txHash: string }>('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Intel Brief (paid forensic decode) — treasury + price come from /config at
  // runtime (NEXT_PUBLIC_* is baked at build time, so we never rely on it).
  getBriefConfig: () => fetchApi<BriefConfig>('/api/brief/config'),
  createBriefOrder: (body: CreateBriefOrderBody) =>
    fetchApi<{ success: true; order: BriefOrder }>('/api/brief/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  payBriefOrder: (id: string, txHash: string) =>
    fetchApi<{ success: true; order: BriefOrder }>(`/api/brief/orders/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    }),
  getMyBriefOrders: () =>
    fetchApi<{ success: true; orders: BriefOrder[] }>('/api/brief/orders/mine'),
};

// Types
export interface FleetOverview {
  agents: { total: number };
  transactions24h: number;
  gasSpend24h: number;
  totalValue: number;
}

export interface Agent {
  id: number;
  chain: string;
  walletAddress: string;
  agentName: string | null;
  agentFramework: string | null;
  registrySource: string;
  isSafe: boolean;
  isPublic: boolean;
  confidence: number;
  tags: string[] | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStats {
  agent: Agent;
  stats: {
    txCount24h: number;
    gasSpend24h: number;
    volume24h: number;
    txCount7d: number;
    gasSpend7d: number;
  };
}

export interface CreateAgentBody {
  chain: string;
  walletAddress: string;
  agentName?: string;
  agentFramework?: string;
  tags?: string[];
  confirmContract?: boolean;
}

export interface UpdateAgentBody {
  agentName?: string;
  agentFramework?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface Transaction {
  timestamp: string;
  chain: string;
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  direction: string;
  counterparty: string | null;
  tokenSymbol: string | null;
  amountUsd: string | null;
  gasCostUsd: string | null;
  txType: string | null;
  methodName: string | null;
  status: string;
}

export interface TxListResponse {
  success: true;
  data: Transaction[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface TxVolumeBucket {
  bucket: string;
  tx_count: number;
  total_volume_usd: string;
  total_gas_usd: string;
}

export interface BalanceEntry {
  wallet_address: string;
  chain: string;
  token_address: string | null;
  token_symbol: string;
  balance_raw: string;
  balance_usd: string;
  timestamp: string;
}

export interface BalanceHistoryBucket {
  bucket: string;
  token_symbol: string;
  token_address: string | null;
  balance_usd: string;
  balance_raw: string;
}

export interface GasBucket {
  bucket: string;
  tx_count: number;
  total_gas_usd: string;
  avg_gas_usd: string;
  max_gas_usd: string;
  avg_gas_price_gwei: string;
}

export interface AlertConfig {
  id: number;
  walletAddress: string;
  chain: string;
  alertType: string;
  thresholdValue: string | null;
  thresholdUnit: string | null;
  channels: string[];
  webhookUrl: string | null;
  telegramChatId: string | null;
  discordWebhook: string | null;
  enabled: boolean;
  cooldown: string | null;
  createdAt: string;
}

export interface CreateAlertBody {
  walletAddress: string;
  chain: string;
  alertType: string;
  thresholdValue?: string;
  thresholdUnit?: string;
  lookbackWindow?: string;
  channels: string[];
  webhookUrl?: string;
  telegramChatId?: string;
  discordWebhook?: string;
  cooldown?: string;
}

export interface AlertEvent {
  timestamp: string;
  alertConfigId: number;
  walletAddress: string;
  chain: string;
  alertType: string;
  severity: string;
  title: string;
  description: string | null;
  triggerValue: string | null;
  triggerTxHash: string | null;
  delivered: boolean;
  deliveryChannel: string | null;
  deliveryError: string | null;
}

export interface AlertEventsResponse {
  success: true;
  data: AlertEvent[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithRawKey extends ApiKey {
  rawKey: string;
}

export interface AgentEvent {
  timestamp: string;
  agentId: number;
  walletAddress: string;
  chain: string;
  eventType: string;
  payload: Record<string, unknown>;
  ingestedAt: string;
}

export interface CreateApiKeyBody {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

// ── Intel Brief (paid forensic decode) ──────────────────────────────────────

export type BriefContactMethod = 'email' | 'telegram' | 'x' | 'discord' | 'other';

export interface BriefConfig {
  success: true;
  treasuryAddress: string | null;
  priceMicroUsdc: string;
  priceUsdc: number;
  available: boolean;
}

export interface BriefOrder {
  id: string;
  userId: string;
  walletAddress: string;
  target: string;
  targetKind: 'address' | 'handle';
  contact: string;
  contactMethod: BriefContactMethod;
  notes: string | null;
  plan: string;
  amountUsdc: number; // micro-USDC (6 decimals)
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled';
  txHash: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

export interface CreateBriefOrderBody {
  target: string;
  contact: string;
  contactMethod: BriefContactMethod;
  notes?: string;
}

// ── Wallet Lookup (public) ──────────────────────────────────────────────────

export interface LookupTokenBalance {
  contractAddress: string; // 'native' for ETH, hex address for ERC-20
  tokenBalance: string;    // hex string (use BigInt to parse)
  error: string | null;
}

export interface LookupTransaction {
  hash: string;
  blockNum: string; // hex
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string; // 'external' | 'erc20'
  direction: 'inbound' | 'outbound';
}

export interface WalletLookupResult {
  address: string;
  chain: string;
  balances: LookupTokenBalance[];
  transactions: LookupTransaction[];
  cachedAt: string;
}

export interface PublicAgentData {
  agent: {
    walletAddress: string;
    agentName: string | null;
    agentFramework: string | null;
    chain: string;
    createdAt: string;
  };
  stats: {
    txCount24h: number;
    gasSpend24h: number;
    volume24h: number;
    txCount7d: number;
    gasSpend7d: number;
  };
  balanceHistory: BalanceHistoryBucket[];
  gasHistory: GasBucket[];
  recentTxs: Transaction[];
}

// ── Risk Check (public, free-first v1) ──────────────────────────────────────
// Mirrors the canonical contract in apps/api/src/routes/risk.ts. EVERY response
// is the standard envelope { success, data }; useApi unwraps `.data`, so the
// shapes below describe what lives under `data`.

export type RiskBand = 'low-signal' | 'mixed' | 'elevated' | 'high-signal';
export type RiskSeverity = 'info' | 'low' | 'medium' | 'high';

export interface RiskFlag {
  id: string;
  severity: RiskSeverity;
  title: string;
  evidence: string;
  source: string;
}

export interface RiskFreshness {
  as_of_block: number;
  generated_at: string; // ISO-8601
  ttl_state: 'fresh' | 'stale';
}

// NOTE: signal_density is stored server-side for library sorting but is
// intentionally absent from the Report payload — never render it as a rating.
export interface RiskReport {
  address: string;
  chain: string;
  band: RiskBand;
  flags: RiskFlag[];
  not_assessed: string[];
  freshness: RiskFreshness;
  classifier_version: string;
  view_count: number;
  disclaimer: string;
}

export interface RiskTeaser {
  address: string;
  public_stats: {
    tx_count: number;
    eth_balance: number;
    usdc_balance: number;
    token_count: number;
    unique_counterparties_30d: number;
    latest_transfer_at: string | null;
    is_acp_agent: boolean;
  };
  history_present: true;
}

export interface RiskReportCard {
  address: string;
  agent_name?: string;
  band: RiskBand;
  flag_count: number;
  top_severity: RiskSeverity | null;
  as_of_date: string; // ISO-8601 (generated_at)
  view_count: number;
  report_url: string; // backend emits /risk/report/<address>
}

// Discriminated union on `status` — POST /api/risk/check (data).
export type RiskCheckResult =
  | { status: 'ready'; report: RiskReport }
  | { status: 'stale'; report: RiskReport; recheck_offer: true }
  | { status: 'teaser'; teaser: RiskTeaser }
  | { status: 'no_history' }
  | { status: 'queued'; check_id: string };

// Discriminated union on `status` — GET /api/risk/check/:id (data).
export type RiskCheckStatus =
  | { status: 'pending' }
  | { status: 'ready'; report: RiskReport }
  | { status: 'failed'; error: string };

export interface RiskLibraryResult {
  reports: RiskReportCard[];
  pagination: { limit: number; offset: number; total: number };
}

export const publicApi = {
  lookupWallet: (address: string) =>
    fetchApi<{ success: true; data: WalletLookupResult }>(`/api/wallets/${address}`),
  getPublicAgent: (wallet: string) =>
    fetchApi<{ success: true; data: PublicAgentData }>(`/api/public/agents/${wallet}`),

  // Risk check — POST returns a discriminated union on `status`.
  checkAddress: (target: string, forceRecheck = false) =>
    fetchApi<{ success: true; data: RiskCheckResult }>('/api/risk/check', {
      method: 'POST',
      body: JSON.stringify({ target, force_recheck: forceRecheck }),
    }),
  // Poll a queued decode by job id.
  getCheckStatus: (id: string) =>
    fetchApi<{ success: true; data: RiskCheckStatus }>(`/api/risk/check/${id}`),
  // Public report page; increments view_count server-side.
  getReport: (address: string) =>
    fetchApi<{ success: true; data: { report: RiskReport } }>(
      `/api/risk/report/${address}`,
    ),
  // Public, SEO-indexed library.
  listReports: (params?: { sort?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return fetchApi<{ success: true; data: RiskLibraryResult }>(
      `/api/risk/library${suffix}`,
    );
  },
};
