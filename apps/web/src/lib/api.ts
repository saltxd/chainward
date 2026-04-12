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

export const publicApi = {
  lookupWallet: (address: string) =>
    fetchApi<{ success: true; data: WalletLookupResult }>(`/api/wallets/${address}`),
  getPublicAgent: (wallet: string) =>
    fetchApi<{ success: true; data: PublicAgentData }>(`/api/public/agents/${wallet}`),
};
