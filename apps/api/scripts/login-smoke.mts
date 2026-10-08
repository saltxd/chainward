/**
 * Login smoke test: signs in to a running API the way real Base users do.
 *
 *   pnpm --filter @chainward/api exec tsx scripts/login-smoke.mts                      # against https://api.chainward.ai
 *   API_URL=http://localhost:8000 pnpm --filter @chainward/api exec tsx scripts/login-smoke.mts
 *
 * Two sign-ins, both through GET /api/auth/nonce then POST /api/auth/verify:
 *   1. an EOA (plain ECDSA signature)
 *   2. an undeployed Coinbase Smart Wallet (ERC-6492 wrapped ERC-1271 signature),
 *      which the API must validate on Base. This is the case that was broken until
 *      7f69abc: siwe's verify() without a provider only accepted EOAs.
 * After each sign-in: the session shows the wallet, an API key is created, used as
 * Bearer auth, revoked, and refused afterwards. The EOA then does what an agent
 * developer does: registers a wallet, reads it, sets an alert on it (lowercase
 * spelling), deletes both. A tampered message must be refused.
 * Exit code 1 on any failure.
 *
 * Both signers derive from one fixed, publicly known key so the smoke leaves a
 * single pair of empty user rows instead of a new one per run. Nothing of value
 * is ever held by or attached to those accounts.
 */
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { toCoinbaseSmartAccount } from 'viem/account-abstraction';
import { SiweMessage } from 'siwe';

const API_URL = (process.env.API_URL ?? 'https://api.chainward.ai').replace(/\/$/, '');
const DOMAIN = process.env.SIWE_DOMAIN ?? 'chainward.ai';
const RPC = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
// Smoke-only key, public by design (see header). Never fund it.
const SMOKE_KEY = '0x000000000000000000000000000000000000000000000000000000c4a1a3a0de' as const;

interface Signer {
  label: string;
  address: `0x${string}`;
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
}

async function nonce(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/nonce`);
  if (!res.ok) throw new Error(`nonce: HTTP ${res.status}`);
  const body = (await res.json()) as { nonce: string };
  return body.nonce;
}

async function verify(message: string, signature: string): Promise<{ status: number; cookie: string | null; body: string }> {
  const res = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').match(/chainward-session=[^;]+/)?.[0] ?? null;
  return { status: res.status, cookie, body: (await res.text()).slice(0, 160) };
}

/** What a signed-in user does next: session, API key, a Bearer call, revoke. */
async function dashboard(label: string, cookie: string, address: string): Promise<boolean> {
  const check = (pass: boolean, what: string): boolean => {
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label} ${what}`);
    return pass;
  };
  const session = await fetch(`${API_URL}/api/auth/session`, { headers: { cookie } });
  const sessionBody = (await session.json()) as { user?: { walletAddress?: string } | null };
  let ok = check(
    session.status === 200 && (sessionBody.user?.walletAddress ?? '').toLowerCase() === address.toLowerCase(),
    `session shows the signed-in wallet: HTTP ${session.status}`,
  );

  const created = await fetch(`${API_URL}/api/keys`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `login-smoke ${new Date().toISOString()}` }),
  });
  const createdBody = (await created.json()) as { data?: { id: number; rawKey: string } };
  const key = createdBody.data;
  ok = check(created.status === 201 && Boolean(key?.rawKey?.startsWith('ag_')), `API key created: HTTP ${created.status}`) && ok;
  if (!key) return false;

  const viaKey = await fetch(`${API_URL}/api/agents`, { headers: { authorization: `Bearer ${key.rawKey}` } });
  ok = check(viaKey.status === 200, `Bearer ag_ key lists agents: HTTP ${viaKey.status}`) && ok;

  const revoked = await fetch(`${API_URL}/api/keys/${key.id}`, { method: 'DELETE', headers: { cookie } });
  ok = check(revoked.status === 200, `API key revoked: HTTP ${revoked.status}`) && ok;

  const afterRevoke = await fetch(`${API_URL}/api/agents`, { headers: { authorization: `Bearer ${key.rawKey}` } });
  ok = check(afterRevoke.status === 401, `revoked key refused: HTTP ${afterRevoke.status}`) && ok;
  return ok;
}

// A wallet with real Base activity, spelled lowercase the way SDK and CLI users
// type it (the API stores it checksummed; alerts must still match it).
const WATCHED_WALLET = '0x42a09a72ec47647fe9be1f450ab8f835d0ff556a';

/** What an agent developer does: register a wallet, read it, set an alert, clean up. */
async function developerFlow(label: string, cookie: string): Promise<boolean> {
  const H = { cookie, 'content-type': 'application/json' };
  const check = (pass: boolean, what: string): boolean => {
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label} ${what}`);
    return pass;
  };
  const registered = await fetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ chain: 'base', walletAddress: WATCHED_WALLET, agentName: 'login-smoke agent' }),
  });
  const agent = ((await registered.json()) as { data?: { id: number } }).data;
  let ok = check(registered.status === 201 && Boolean(agent?.id), `agent registered: HTTP ${registered.status}`);
  if (!agent) return false;

  const got = await fetch(`${API_URL}/api/agents/${agent.id}`, { headers: H });
  ok = check(got.status === 200, `agent read back: HTTP ${got.status}`) && ok;
  // The indexer backfills 30 days of history on registration (Alchemy transfer
  // index). It failed silently for months (HTTP 413 on every RPC), so wait for it.
  let total = 0;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const txs = await fetch(`${API_URL}/api/transactions?agentId=${agent.id}&limit=1`, { headers: H });
    total = ((await txs.json()) as { pagination?: { total?: number } }).pagination?.total ?? 0;
    if (total > 0) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  ok = check(total > 0, `history backfilled after registration: ${total} transactions`) && ok;

  const alertRes = await fetch(`${API_URL}/api/alerts`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      walletAddress: WATCHED_WALLET,
      chain: 'base',
      alertType: 'large_transfer',
      thresholdValue: '100',
      thresholdUnit: 'usd',
      channels: ['webhook'],
      webhookUrl: 'https://example.com/chainward-smoke',
    }),
  });
  const alert = ((await alertRes.json()) as { data?: { id: number } }).data;
  ok = check(alertRes.status === 201 && Boolean(alert?.id), `alert created for the lowercase wallet: HTTP ${alertRes.status}`) && ok;
  if (alert?.id) {
    const removed = await fetch(`${API_URL}/api/alerts/${alert.id}`, { method: 'DELETE', headers: { cookie } });
    ok = check(removed.status === 200, `alert deleted: HTTP ${removed.status}`) && ok;
  }
  const gone = await fetch(`${API_URL}/api/agents/${agent.id}`, { method: 'DELETE', headers: { cookie } });
  ok = check(gone.status === 200, `agent deleted: HTTP ${gone.status}`) && ok;
  return ok;
}

function siweMessage(address: string, n: string): string {
  return new SiweMessage({
    domain: DOMAIN,
    address,
    statement: 'Sign in to ChainWard',
    uri: `https://${DOMAIN}/login`,
    version: '1',
    chainId: base.id,
    nonce: n,
    issuedAt: new Date().toISOString(),
  }).prepareMessage();
}

async function signIn(signer: Signer): Promise<boolean> {
  const message = siweMessage(signer.address, await nonce());
  const signature = await signer.signMessage({ message });
  const ok = await verify(message, signature);
  const pass = ok.status === 200 && ok.cookie !== null;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${signer.label} sign-in: HTTP ${ok.status}, session cookie ${ok.cookie !== null}${pass ? '' : ` ${ok.body}`}`);
  if (!pass || ok.cookie === null) return false;
  if (!(await dashboard(signer.label, ok.cookie, signer.address))) return false;
  if (signer.label === 'EOA' && !(await developerFlow(signer.label, ok.cookie))) return false;

  // Same signature over a message with a different nonce must be refused.
  const tampered = await verify(siweMessage(signer.address, await nonce()), signature);
  const refused = tampered.status === 401;
  console.log(`${refused ? 'OK  ' : 'FAIL'} ${signer.label} tampered message refused: HTTP ${tampered.status}`);
  return refused;
}

const client = createPublicClient({ chain: base, transport: http(RPC) });
const owner = privateKeyToAccount(SMOKE_KEY);
const smart = await toCoinbaseSmartAccount({ client, owners: [owner], version: '1.1' });
const deployed = Boolean(await client.getCode({ address: smart.address }));
console.log(`API ${API_URL}, domain ${DOMAIN}`);
console.log(`EOA ${owner.address}; Coinbase Smart Wallet ${smart.address} (${deployed ? 'deployed: ERC-1271' : 'undeployed: ERC-6492'})`);

const results = [
  await signIn({ label: 'EOA', address: owner.address, signMessage: (a) => owner.signMessage(a) }),
  await signIn({ label: 'smart wallet', address: smart.address, signMessage: (a) => smart.signMessage(a) }),
];
if (!results.every(Boolean)) {
  console.error('login smoke FAILED');
  process.exit(1);
}
console.log('login smoke passed');
