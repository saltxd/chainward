export interface ChainWardClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

export class ChainWardClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(opts: ChainWardClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://api.chainward.ai').replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(url, { headers });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string } | string;
    };

    if (!res.ok || body.success === false) {
      const errMsg =
        typeof body.error === 'string'
          ? body.error
          : body.error?.message ?? `HTTP ${res.status}`;
      throw new ChainWardApiError(errMsg, res.status);
    }
    return body.data as T;
  }
}

export class ChainWardApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ChainWardApiError';
  }
}

export interface LookupResult {
  walletAddress: string;
  isKnownAgent: boolean;
  sources: {
    chainward: { name: string | null; framework: string | null; chain: string } | null;
    acp: {
      name: string | null;
      symbol: string | null;
      role: string | null;
      twitterHandle: string | null;
      hasGraduated: boolean;
    } | null;
  };
  decodes: DecodeRef[];
}

export interface DecodeRef {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  url: string;
  addresses: string[];
}

export interface AgentProfile {
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
  balanceHistory: unknown[];
  gasHistory: unknown[];
  recentTxs: unknown[];
  decodes: DecodeRef[];
}

export interface AgentEconomics {
  name: string;
  walletAddress: string;
  symbol: string | null;
  role: string | null;
  profilePic: string | null;
  hasGraduated: boolean;
  isOnline: boolean;
  twitterHandle: string | null;
  revenue: number;
  agdp: number;
  jobs: number;
  successRate: number;
  uniqueBuyers: number;
  offerings: unknown;
  lastActiveAt: string | null;
  gasCost30d: number;
  txCount30d: number;
  failedTx30d: number;
  profit30d: number;
  gasEfficiency: number | null;
}
