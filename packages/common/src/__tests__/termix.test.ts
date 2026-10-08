import { describe, expect, it, vi } from 'vitest';
import {
  HIRE_CHECK_LISTING,
  TERMIX_API_BASE,
  TERMIX_SELECTORS,
  TermixApiError,
  TermixClient,
  TermixIntentError,
  checkProviderIntent,
  termixEscrows,
  type TermixContractsConfig,
} from '../termix/index.js';

// The TermiX client against a fake platform backend (fetch is injected). No
// network. Login is the documented EIP-191 flow: nonce -> personal_sign of the
// returned message -> POST /auth/wallet with the nonce (not the message).

const WALLET = '0xf7Ee65130Fb2B3bb42Cc5cbFED085d7D482667cD' as const;
const ORDER = '0x4c28af4f02fac787e1925d76d7087d5fa1662ab7c927c83bde6fc1851087171f';
const USDT_ESCROW = '0xCE02f987D8b8AF694E13C8a843Db9c77caBF544c';

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

function fakeBackend(routes: Record<string, (call: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const call: Call = {
      method,
      path: u.pathname + u.search,
      auth: headers.get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const handler = routes[`${method} ${u.pathname}`];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no route' } }), { status: 404 });
    const { status = 200, body } = handler(call);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  return { calls, fetchFn };
}

const signer = {
  address: WALLET,
  signMessage: vi.fn(async (message: string) => `0xsig:${message}` as `0x${string}`),
};

function loginRoutes(token = 'access-1') {
  return {
    'POST /api/v1/auth/nonce': () => ({ body: { walletAddress: WALLET.toLowerCase(), nonce: 'n1', message: 'termix-platform wants you to sign in: n1' } }),
    'POST /api/v1/auth/wallet': () => ({
      body: { accessToken: token, refreshToken: 'tr_1', account: { id: 'acct1', walletAddress: WALLET.toLowerCase() }, isNewAccount: false },
    }),
  };
}

describe('TermixClient', () => {
  it('defaults to the BNB Chain backend', () => {
    expect(TERMIX_API_BASE.bsc).toBe('https://platform-backend.prod.termix.live');
  });

  it('logs in with the nonce flow and sends the session as a Bearer token', async () => {
    const { calls, fetchFn } = fakeBackend({
      ...loginRoutes(),
      'GET /api/v1/me': () => ({ body: { account: { id: 'acct1' } } }),
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, signer, fetch: fetchFn });
    const me = await client.me();
    expect(me).toEqual({ account: { id: 'acct1' } });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/v1/auth/nonce', 'POST /api/v1/auth/wallet', 'GET /api/v1/me']);
    expect(calls[0]!.body).toEqual({ walletAddress: WALLET });
    // The signature is over the server's message; the nonce (not the message) goes back.
    expect(signer.signMessage).toHaveBeenCalledWith('termix-platform wants you to sign in: n1');
    expect(calls[1]!.body).toEqual({ walletAddress: WALLET, nonce: 'n1', signature: '0xsig:termix-platform wants you to sign in: n1' });
    expect(calls[2]!.auth).toBe('Bearer access-1');
  });

  it('re-logs in once on a 401 and retries the call', async () => {
    let meCalls = 0;
    let wallets = 0;
    const { fetchFn } = fakeBackend({
      'POST /api/v1/auth/nonce': () => ({ body: { nonce: 'n', message: 'm' } }),
      'POST /api/v1/auth/wallet': () => ({ body: { accessToken: `access-${++wallets}`, account: { id: 'a' } } }),
      'POST /api/v1/auth/refresh': () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'expired' } } }),
      'GET /api/v1/me': (c) => {
        meCalls++;
        return c.auth === 'Bearer access-2' ? { body: { ok: true } } : { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'expired' } } };
      },
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, signer, fetch: fetchFn });
    await expect(client.me()).resolves.toEqual({ ok: true });
    expect(meCalls).toBe(2);
    expect(wallets).toBe(2);
  });

  it('surfaces business gates with their code and message', async () => {
    const { fetchFn } = fakeBackend({
      ...loginRoutes(),
      'POST /api/v1/orders/o1/provider-accept/prepare': () => ({
        status: 403,
        body: { error: { code: 'STAKE_GATE_NOT_MET', message: 'Need 5 USDT more stake' } },
      }),
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, signer, fetch: fetchFn });
    const err = await client.prepareProviderAccept('o1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TermixApiError);
    expect(err).toMatchObject({ status: 403, code: 'STAKE_GATE_NOT_MET', message: expect.stringContaining('Need 5 USDT more stake') });
  });

  it('reads public endpoints without logging in', async () => {
    const { calls, fetchFn } = fakeBackend({
      'GET /api/v1/agents/name-availability': () => ({ body: { available: true, normalized: 'chainward.agent' } }),
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, fetch: fetchFn });
    await expect(client.nameAvailability('chainward')).resolves.toEqual({ available: true, normalized: 'chainward.agent' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/v1/agents/name-availability?name=chainward');
    expect(calls[0]!.auth).toBeNull();
  });

  it('updates a listing in place with PATCH /api/v1/listings/:id, as the session', async () => {
    const { calls, fetchFn } = fakeBackend({
      ...loginRoutes(),
      'PATCH /api/v1/listings/lst1': (call) => ({ body: { id: 'lst1', status: 'PUBLISHED', ...(call.body as object) } }),
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, signer, fetch: fetchFn });
    const updated = await client.updateListing('lst1', { title: 'New title', description: 'New description' });
    expect(updated).toMatchObject({ id: 'lst1', title: 'New title' });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/api/v1/listings/lst1');
    expect(patch.auth).toBe('Bearer access-1');
    expect(patch.body).toEqual({ title: 'New title', description: 'New description' });
  });

  it('refuses a session call without a signer instead of sending it unauthenticated', async () => {
    const { calls, fetchFn } = fakeBackend({});
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, fetch: fetchFn });
    await expect(client.me()).rejects.toThrow(/signer/);
    expect(calls).toHaveLength(0);
  });

  it('never puts the session token in an error message', async () => {
    const { fetchFn } = fakeBackend({
      ...loginRoutes('secret-token-value'),
      'GET /api/v1/orders/x': () => ({ status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }),
    });
    const client = new TermixClient({ baseUrl: TERMIX_API_BASE.bsc, signer, fetch: fetchFn });
    const err = (await client.order('x').catch((e: unknown) => e)) as Error;
    expect(String(err.message)).not.toContain('secret-token-value');
  });
});

// ─── tx-intent guard ──────────────────────────────────────────────────────────

const CONFIG: TermixContractsConfig = {
  chainId: 56,
  protocolFeeBps: 200,
  settlementCurrencies: [
    { symbol: 'USDC', decimals: 18, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', protocolFeeBps: 200, providerLockBps: 0, contracts: { escrow: '0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C', staking: '0x0', campaignVault: '0x0' } },
    { symbol: 'USDT', decimals: 18, address: '0x55d398326f99059fF775485246999027B3197955', protocolFeeBps: 200, providerLockBps: 0, contracts: { escrow: USDT_ESCROW, staking: '0x0', campaignVault: '0x0' } },
  ],
};

const orderArg = ORDER.slice(2);
const hash32 = 'ab'.repeat(32);

describe('checkProviderIntent', () => {
  const expectFor = (action: 'acceptOrder' | 'submitDelivery' | 'claimAfterTimeout') => ({
    action,
    chainId: 56,
    escrows: termixEscrows(CONFIG),
    chainOrderId: ORDER,
  });

  it('passes the three provider calls on the escrow for this order', () => {
    const accept = checkProviderIntent(
      { action: 'acceptOrder', chainId: 56, contract: USDT_ESCROW, callData: `${TERMIX_SELECTORS.acceptOrder}${orderArg}`, value: '0' },
      expectFor('acceptOrder'),
    );
    expect(accept).toEqual({ to: USDT_ESCROW, data: `${TERMIX_SELECTORS.acceptOrder}${orderArg}` });
    expect(
      checkProviderIntent(
        { action: 'submitDelivery', chainId: '56', to: USDT_ESCROW.toLowerCase(), data: `${TERMIX_SELECTORS.submitDelivery}${orderArg}${hash32}` },
        expectFor('submitDelivery'),
      ).data,
    ).toBe(`${TERMIX_SELECTORS.submitDelivery}${orderArg}${hash32}`);
    expect(
      checkProviderIntent({ chainId: 56, contract: USDT_ESCROW, callData: `${TERMIX_SELECTORS.claimAfterTimeout}${orderArg}` }, expectFor('claimAfterTimeout')).to,
    ).toBe(USDT_ESCROW);
  });

  it('matches the selectors measured on the BSC escrows', () => {
    expect(TERMIX_SELECTORS).toEqual({ acceptOrder: '0xdfc86408', submitDelivery: '0x94e8b028', claimAfterTimeout: '0x22399f5d' });
  });

  it.each([
    ['another chain', { chainId: 8453 }],
    ['a contract that is not a TermiX escrow', { contract: '0x55d398326f99059fF775485246999027B3197955' }],
    ['a non-zero value', { value: '1' }],
    ['another function (an ERC-20 approve)', { callData: `0x095ea7b3${'00'.repeat(64)}` }],
    ['another order id', { callData: `${TERMIX_SELECTORS.acceptOrder}${'11'.repeat(32)}` }],
    ['trailing bytes', { callData: `${TERMIX_SELECTORS.acceptOrder}${orderArg}00` }],
    ['no calldata', { callData: undefined }],
  ])('refuses %s', (_label, patch) => {
    const intent = { action: 'acceptOrder', chainId: 56, contract: USDT_ESCROW, callData: `${TERMIX_SELECTORS.acceptOrder}${orderArg}`, value: '0', ...patch };
    expect(() => checkProviderIntent(intent, expectFor('acceptOrder'))).toThrow(TermixIntentError);
  });

  it('refuses an intent whose action label disagrees with what was asked for', () => {
    expect(() =>
      checkProviderIntent(
        { action: 'releaseEscrow', chainId: 56, contract: USDT_ESCROW, callData: `${TERMIX_SELECTORS.acceptOrder}${orderArg}` },
        expectFor('acceptOrder'),
      ),
    ).toThrow(TermixIntentError);
  });
});

describe('HIRE_CHECK_LISTING', () => {
  it('is a valid create-listing body for the strict schema', () => {
    expect(HIRE_CHECK_LISTING).toMatchObject({
      title: 'Set and Earn hire check: will your agent pass?',
      category: 'Security & Verification',
      currency: 'USDT',
      instantBuyable: true,
      publicSearch: true,
    });
    expect(Number(HIRE_CHECK_LISTING.basePrice)).toBeGreaterThan(0);
    expect(HIRE_CHECK_LISTING.description.length).toBeLessThanOrEqual(5000);
    expect(HIRE_CHECK_LISTING.coverImageUrl).toMatch(/^https:\/\//);
    expect(HIRE_CHECK_LISTING.challengeWindowHours).toBeGreaterThanOrEqual(24);
  });

  it('says what the deliverable is: a verdict, its reason, the report, the limits', () => {
    const d = HIRE_CHECK_LISTING.description;
    expect(d).toMatch(/JSON report/);
    expect(d).toMatch(/summary/);
    expect(d).toMatch(/Hired by others, Hired by its own circle, or Not enough data/);
    expect(d).toMatch(/not proven independence/);
  });

  it('uses no em dashes in its copy', () => {
    expect(JSON.stringify(HIRE_CHECK_LISTING)).not.toMatch(/—/);
  });
});
