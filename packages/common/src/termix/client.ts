// ─── TermiX platform API client (AACP, dev-v2 backend) ───────────────────────
//
// The REST half of selling on TermiX: wallet login, listings, orders, delivery
// artifacts. Anything that moves money comes back as an unsigned tx-intent that
// the caller checks (intent.ts) and signs itself; the backend never broadcasts.
// Endpoints and auth are from TermiX's own agent skill (v1.8.0) and API docs;
// see docs/termix-provider.md. The session token lives in memory only and is
// never put in an error message.

export type TermixChain = 'bsc' | 'base';

/** One backend per chain; nothing (accounts, agents, orders) crosses between them. */
export const TERMIX_API_BASE: Record<TermixChain, string> = {
  bsc: 'https://platform-backend.prod.termix.live',
  base: 'https://platform-backend-base.prod.termix.live',
};

export interface TermixSigner {
  address: `0x${string}`;
  /** EIP-191 personal_sign over the exact message string. */
  signMessage(message: string): Promise<`0x${string}`>;
}

export interface TermixClientOptions {
  baseUrl: string;
  /** Needed for every session call; public reads work without it. */
  signer?: TermixSigner;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class TermixApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly path: string,
  ) {
    super(`TermiX ${path} -> HTTP ${status}${code ? ` ${code}` : ''}: ${message}`);
    this.name = 'TermixApiError';
  }
}

type Auth = 'session' | 'none';

export interface TermixLogin {
  accountId: string | null;
  isNewAccount: boolean;
}

export interface TermixSettlementCurrency {
  symbol: string;
  decimals: number;
  address: string;
  protocolFeeBps: number;
  providerLockBps: number | null;
  contracts: { escrow: string; staking: string; campaignVault: string };
}

export interface TermixContractsConfig {
  chainId: number;
  protocolFeeBps: number;
  settlementCurrencies: TermixSettlementCurrency[];
}

/** Presigned PUT for a delivery artifact or listing media. */
export interface TermixUploadUrl {
  uploadUrl: string;
  s3Key: string;
  publicUrl: string;
  headers?: Record<string, string>;
}

export interface TermixArtifactInput {
  s3Key: string;
  url: string;
  sha256: string;
  contentType: string;
  sizeBytes: number;
}

/** The fields of an order this codebase reads; the backend returns many more. */
export interface TermixOrder {
  id: string;
  chainOrderId?: string | null;
  escrowContract?: string | null;
  status: string;
  budget?: string;
  currency?: string;
  listingId?: string | null;
  offerId?: string | null;
  redoUsed?: boolean;
  deliveryHash?: string | null;
  deliveryDueAt?: string | null;
  challengeWindowEndsAt?: string | null;
  deadlines?: { deliveryDueAt?: string | null; challengeWindowEndsAt?: string | null } | null;
  conversationId?: string | null;
  conversation?: { id?: string | null } | null;
  buyer?: { id?: string; walletAddress?: string; handle?: string } | null;
  seller?: { id?: string; agentTokenId?: string; handle?: string } | null;
  listing?: { id?: string; skillTag?: string; title?: string } | null;
  availableActions?: Record<string, boolean> | null;
  [key: string]: unknown;
}

export interface TermixPage<T> {
  items: T[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export class TermixClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private access: string | null = null;
  private refresh: string | null = null;

  constructor(private readonly opts: TermixClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  get walletAddress(): string | null {
    return this.opts.signer?.address ?? null;
  }

  /**
   * Sign in (and, for a wallet with no account yet, sign up: TermiX creates the
   * account on first login). Off-chain, no gas.
   */
  async login(): Promise<TermixLogin> {
    const signer = this.requireSigner();
    const nonce = await this.raw<{ nonce: string; message: string }>('POST', '/api/v1/auth/nonce', { walletAddress: signer.address }, null);
    const signature = await signer.signMessage(nonce.message);
    const res = await this.raw<{ accessToken: string; refreshToken?: string; account?: { id?: string }; isNewAccount?: boolean }>(
      'POST',
      '/api/v1/auth/wallet',
      { walletAddress: signer.address, nonce: nonce.nonce, signature },
      null,
    );
    this.access = res.accessToken;
    this.refresh = res.refreshToken ?? null;
    return { accountId: res.account?.id ?? null, isNewAccount: Boolean(res.isNewAccount) };
  }

  async request<T>(method: string, path: string, opts: { body?: unknown; auth?: Auth } = {}): Promise<T> {
    if ((opts.auth ?? 'session') === 'none') return this.raw<T>(method, path, opts.body, null);
    this.requireSigner();
    if (!this.access) await this.login();
    try {
      return await this.raw<T>(method, path, opts.body, this.access);
    } catch (err) {
      if (!(err instanceof TermixApiError) || err.status !== 401) throw err;
      await this.renewSession();
      return this.raw<T>(method, path, opts.body, this.access);
    }
  }

  // ── public reads ──────────────────────────────────────────────────────────

  contractsConfig() {
    return this.request<TermixContractsConfig>('GET', '/api/v1/config/contracts', { auth: 'none' });
  }
  nameAvailability(name: string) {
    return this.request<{ available: boolean; normalized: string }>('GET', `/api/v1/agents/name-availability?name=${encodeURIComponent(name)}`, { auth: 'none' });
  }
  /** Public storefront; an agent minted outside TermiX is indexed under its token id as the handle. */
  agentByHandle(handle: string) {
    return this.request<{ seller?: { id: string; agentTokenId?: string; ownerAddress?: string; accountId?: string; displayName?: string; presence?: string } }>(
      'GET',
      `/api/v1/agents/${encodeURIComponent(handle)}`,
      { auth: 'none' },
    );
  }
  agentServices(agentId: string) {
    return this.request<{ items: Array<{ id: string; title?: string; skillTag?: string; status?: string; basePrice?: string; currency?: string }> }>(
      'GET',
      `/api/v1/agents/${encodeURIComponent(agentId)}/services`,
      { auth: 'none' },
    );
  }

  // ── account ───────────────────────────────────────────────────────────────

  me() {
    return this.request<Record<string, unknown>>('GET', '/api/v1/me');
  }
  myAgents() {
    return this.request<{ items?: Array<{ id: string; agentTokenId?: string; name?: string }> } | Array<{ id: string; agentTokenId?: string; name?: string }>>(
      'GET',
      '/api/v1/agents',
    );
  }

  // ── listings (off-chain) ──────────────────────────────────────────────────

  createListing(agentId: string, body: object) {
    return this.request<{ id: string; status?: string }>('POST', `/api/v1/agents/${encodeURIComponent(agentId)}/services`, { body });
  }
  publishListing(listingId: string) {
    return this.request<{ id: string; status?: string }>('POST', `/api/v1/listings/${encodeURIComponent(listingId)}/publish`, { body: {} });
  }

  // ── orders (provider side) ────────────────────────────────────────────────

  providerOrders(query: { providerAgentId: string; page?: number; pageSize?: number }) {
    const q = new URLSearchParams({ side: 'provider', providerAgentId: query.providerAgentId, page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 50) });
    return this.request<TermixPage<TermixOrder>>('GET', `/api/v1/orders?${q.toString()}`);
  }
  order(orderId: string) {
    return this.request<TermixOrder>('GET', `/api/v1/orders/${encodeURIComponent(orderId)}`);
  }
  conversationMessages(conversationId: string) {
    return this.request<unknown>('GET', `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`);
  }
  sendMessage(conversationId: string, text: string, fromProviderAgentId: string) {
    return this.request<unknown>('POST', `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { body: { text, fromProviderAgentId } });
  }
  prepareProviderAccept(orderId: string) {
    return this.request<Record<string, unknown>>('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/provider-accept/prepare`, { body: {} });
  }
  deliveryUploadUrl(orderId: string, file: { fileName: string; contentType: string; sizeBytes: number }) {
    return this.request<TermixUploadUrl>('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/delivery/upload-url`, { body: file });
  }
  deliveryArtifacts(orderId: string) {
    return this.request<unknown>('GET', `/api/v1/orders/${encodeURIComponent(orderId)}/delivery/artifacts`);
  }
  registerArtifact(orderId: string, artifact: TermixArtifactInput) {
    return this.request<{ id: string }>('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/delivery/artifacts`, { body: artifact });
  }
  prepareSubmitDelivery(orderId: string, body: { artifactIds: string[]; note?: string }) {
    return this.request<Record<string, unknown>>('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/delivery/submit`, { body });
  }
  prepareClaimAfterTimeout(orderId: string) {
    return this.request<Record<string, unknown>>('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/claim-after-timeout/prepare`, { body: {} });
  }

  /** PUT bytes to a presigned upload URL (no TermiX auth on S3). */
  async putUpload(upload: TermixUploadUrl, bytes: Uint8Array, contentType: string): Promise<void> {
    const res = await this.fetchFn(upload.uploadUrl, {
      method: 'PUT',
      headers: { ...(upload.headers ?? {}), 'content-type': upload.headers?.['content-type'] ?? contentType },
      // A copy backed by a plain ArrayBuffer, which is what BodyInit accepts.
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new TermixApiError(res.status, null, 'artifact upload failed', 'presigned PUT');
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private requireSigner(): TermixSigner {
    if (!this.opts.signer) throw new Error('TermiX session call needs a signer (the agent owner wallet)');
    return this.opts.signer;
  }

  private async renewSession(): Promise<void> {
    if (this.refresh) {
      try {
        const res = await this.raw<{ accessToken: string }>('POST', '/api/v1/auth/refresh', { refreshToken: this.refresh }, null);
        this.access = res.accessToken;
        return;
      } catch {
        // refresh expired or revoked: fall through to a full login
      }
    }
    await this.login();
  }

  private async raw<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string }; message?: string } | null) ?? null;
      const code = e?.error?.code ?? null;
      const message = e?.error?.message ?? e?.message ?? text.slice(0, 200);
      throw new TermixApiError(res.status, code, message, `${method} ${path.split('?')[0]}`);
    }
    return json as T;
  }
}

/** The page's items whatever the envelope ({items}, {data}, a bare array). */
export function termixItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    for (const key of ['items', 'messages', 'data', 'artifacts']) {
      const v = (res as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
