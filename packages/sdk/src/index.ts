/**
 * AgentGuard TypeScript SDK
 *
 * @example
 * ```ts
 * import { AgentGuard } from '@agentguard/sdk';
 *
 * const ag = new AgentGuard({ apiKey: 'ag_...' });
 * const agents = await ag.agents.list();
 * ```
 */

export interface AgentGuardOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface Agent {
  id: number;
  chain: string;
  walletAddress: string;
  agentName: string | null;
  agentFramework: string | null;
  registrySource: string;
  isSafe: boolean;
  confidence: number;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterAgentInput {
  chain: string;
  wallet: string;
  name?: string;
  framework?: string;
  tags?: string[];
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
  status: string;
}

export interface ListTransactionsInput {
  wallet?: string;
  chain?: string;
  direction?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface AlertConfig {
  id: number;
  walletAddress: string;
  chain: string;
  alertType: string;
  thresholdValue: string | null;
  thresholdUnit: string | null;
  channels: string[];
  enabled: boolean;
}

export interface CreateAlertInput {
  wallet: string;
  chain?: string;
  type: string;
  threshold?: number;
  thresholdUnit?: string;
  channels: string[];
  webhookUrl?: string;
  slackWebhook?: string;
  discordWebhook?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export class AgentGuard {
  private baseUrl: string;
  private apiKey: string;

  readonly agents: AgentsResource;
  readonly transactions: TransactionsResource;
  readonly alerts: AlertsResource;

  constructor(options: AgentGuardOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.agentguard.dev').replace(/\/$/, '');

    this.agents = new AgentsResource(this);
    this.transactions = new TransactionsResource(this);
    this.alerts = new AlertsResource(this);
  }

  /** @internal */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as { error?: { code?: string; message?: string } };
      throw new AgentGuardError(
        error.error?.message ?? `HTTP ${response.status}`,
        error.error?.code ?? 'UNKNOWN',
        response.status,
      );
    }

    return data as T;
  }
}

export class AgentGuardError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = 'AgentGuardError';
  }
}

class AgentsResource {
  constructor(private client: AgentGuard) {}

  async register(input: RegisterAgentInput): Promise<ApiResponse<Agent>> {
    return this.client.request('POST', '/api/agents', {
      chain: input.chain,
      walletAddress: input.wallet,
      agentName: input.name,
      agentFramework: input.framework,
      tags: input.tags,
    });
  }

  async list(): Promise<ApiResponse<Agent[]>> {
    return this.client.request('GET', '/api/agents');
  }

  async get(id: number): Promise<ApiResponse<Agent>> {
    return this.client.request('GET', `/api/agents/${id}`);
  }

  async delete(id: number): Promise<ApiResponse<null>> {
    return this.client.request('DELETE', `/api/agents/${id}`);
  }
}

class TransactionsResource {
  constructor(private client: AgentGuard) {}

  async list(input?: ListTransactionsInput): Promise<PaginatedResponse<Transaction>> {
    const params = new URLSearchParams();
    if (input?.wallet) params.set('wallet', input.wallet);
    if (input?.chain) params.set('chain', input.chain);
    if (input?.direction) params.set('direction', input.direction);
    if (input?.type) params.set('type', input.type);
    if (input?.limit) params.set('limit', String(input.limit));
    if (input?.offset) params.set('offset', String(input.offset));

    const qs = params.toString();
    return this.client.request('GET', `/api/transactions${qs ? `?${qs}` : ''}`);
  }
}

class AlertsResource {
  constructor(private client: AgentGuard) {}

  async create(input: CreateAlertInput): Promise<ApiResponse<AlertConfig>> {
    return this.client.request('POST', '/api/alerts', {
      walletAddress: input.wallet,
      chain: input.chain ?? 'base',
      alertType: input.type,
      thresholdValue: input.threshold?.toString(),
      thresholdUnit: input.thresholdUnit ?? 'usd',
      channels: input.channels,
      webhookUrl: input.webhookUrl,
      slackWebhook: input.slackWebhook,
      discordWebhook: input.discordWebhook,
    });
  }

  async list(): Promise<ApiResponse<AlertConfig[]>> {
    return this.client.request('GET', '/api/alerts');
  }

  async delete(id: number): Promise<ApiResponse<null>> {
    return this.client.request('DELETE', `/api/alerts/${id}`);
  }

  async test(id: number): Promise<ApiResponse<{ message: string }>> {
    return this.client.request('POST', `/api/alerts/${id}/test`);
  }
}
