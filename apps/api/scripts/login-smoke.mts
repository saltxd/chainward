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
 * A tampered message must be refused. Exit code 1 on any failure.
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

async function verify(message: string, signature: string): Promise<{ status: number; cookie: boolean; body: string }> {
  const res = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  return { status: res.status, cookie: /chainward-session=/.test(res.headers.get('set-cookie') ?? ''), body: (await res.text()).slice(0, 160) };
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
  const pass = ok.status === 200 && ok.cookie;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${signer.label} sign-in: HTTP ${ok.status}, session cookie ${ok.cookie}${pass ? '' : ` ${ok.body}`}`);
  if (!pass) return false;

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
