/**
 * What a token's own contract says: does it exist, what is its EIP-712 domain, does
 * it support EIP-3009. Read from a public RPC per chain, at most 2 calls a second, and
 * cached (the lint run's rpccheck.mjs and domainmatch.mjs).
 */
import { decodeFunctionResult, domainSeparator, encodeFunctionData, getAddress, parseAbi } from 'viem';
import { USER_AGENT } from './probe.js';
import { PUBLIC_RPC, chainId } from './networks.js';

export interface TokenFacts {
  caip2: string;
  asset: string;
  checkedAt: string;
  /** No RPC for the chain, or the chain didn't answer: nothing below is known. */
  error?: string;
  codeBytes?: number;
  name?: string | null;
  version?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  domainSeparator?: string | null;
  eip712Domain?: { name: string; version: string; chainId: number; verifyingContract: string } | null;
  /** authorizationState(address,bytes32) answered: the token has EIP-3009. */
  eip3009?: boolean;
}

/** Facts keyed by `${caip2}|${lower-case asset}`. */
export type TokenBook = Record<string, TokenFacts>;

export const tokenKey = (caip2: string, asset: string) => `${caip2}|${asset.toLowerCase()}`;

export function factsFor(book: TokenBook, caip2: string, asset: string): TokenFacts | undefined {
  return book[tokenKey(caip2, asset)];
}

/** Does {name, version} hash to the token's DOMAIN_SEPARATOR? null when the token has none to compare. */
export function domainMatches(info: TokenFacts, name: string, version: string): boolean | null {
  if (!info.domainSeparator) return null;
  try {
    const sep = domainSeparator({
      domain: { name, version, chainId: chainId(info.caip2), verifyingContract: getAddress(info.asset) },
    });
    return sep.toLowerCase() === info.domainSeparator.toLowerCase();
  } catch {
    return null;
  }
}

/** The token's real {name, version}: eip712Domain() when it has one, else name() and version(). */
export function onchainDomain(info: TokenFacts | undefined): { name: string | null; version: string | null } {
  if (!info) return { name: null, version: null };
  if (info.eip712Domain) return { name: info.eip712Domain.name, version: info.eip712Domain.version };
  return { name: info.name ?? null, version: info.version ?? null };
}

const abi = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
]);

type Fn = 'name' | 'version' | 'symbol' | 'decimals' | 'DOMAIN_SEPARATOR' | 'eip712Domain' | 'authorizationState';

export type RpcCall = (url: string, method: string, params: unknown[]) => Promise<unknown>;

/** JSON-RPC over fetch, paced to at most 2 calls a second across all chains. */
export function pacedRpc(gapMs = 520): RpcCall {
  let last = 0;
  let id = 1;
  return async (url, method, params) => {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
    // The URL can carry a key (an rpc.json override): never put it in an error.
    if (j.error) throw new Error(`rpc error ${j.error.code}: ${String(j.error.message).slice(0, 120)}`);
    return j.result;
  };
}

async function call(rpc: RpcCall, url: string, to: string, fn: Fn, args: readonly unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const data = encodeFunctionData({ abi, functionName: fn, args } as Parameters<typeof encodeFunctionData>[0]);
  try {
    const r = await rpc(url, 'eth_call', [{ to, data }, 'latest']);
    if (!r || r === '0x') return { ok: false };
    return { ok: true, value: decodeFunctionResult({ abi, functionName: fn, data: r as `0x${string}` }) };
  } catch {
    return { ok: false };
  }
}

/** Read one token's facts (rpccheck.mjs `checkAsset`). Never throws. */
export async function checkAsset(caip2: string, asset: string, rpcUrl: string | undefined, rpc: RpcCall): Promise<TokenFacts> {
  const out: TokenFacts = { caip2, asset, checkedAt: new Date().toISOString() };
  if (!rpcUrl) return { ...out, error: 'no public RPC for this chain' };
  let addr: string;
  try {
    addr = getAddress(asset);
  } catch {
    return { ...out, error: 'asset is not an address' };
  }
  try {
    const cid = Number(BigInt(String(await rpc(rpcUrl, 'eth_chainId', []))));
    if (cid !== chainId(caip2)) return { ...out, error: `the RPC answered for chain ${cid}` };
    const code = String(await rpc(rpcUrl, 'eth_getCode', [addr, 'latest']));
    out.codeBytes = code === '0x' ? 0 : (code.length - 2) / 2;
  } catch (e) {
    return { ...out, error: `chain did not answer: ${String((e as Error).message).slice(0, 120)}` };
  }
  if (!out.codeBytes) return out;
  for (const fn of ['name', 'version', 'symbol', 'decimals', 'DOMAIN_SEPARATOR'] as const) {
    const r = await call(rpc, rpcUrl, addr, fn);
    const v = r.ok ? r.value : null;
    if (fn === 'decimals') out.decimals = v === null ? null : Number(v);
    else if (fn === 'DOMAIN_SEPARATOR') out.domainSeparator = (v as string | null) ?? null;
    else out[fn] = (v as string | null) ?? null;
  }
  const d = await call(rpc, rpcUrl, addr, 'eip712Domain');
  if (d.ok) {
    const [, name, version, cid, verifyingContract] = d.value as [string, string, string, bigint, string];
    out.eip712Domain = { name, version, chainId: Number(cid), verifyingContract };
  } else out.eip712Domain = null;
  const a = await call(rpc, rpcUrl, addr, 'authorizationState', ['0x0000000000000000000000000000000000000001', `0x${'00'.repeat(32)}`]);
  out.eip3009 = a.ok;
  return out;
}

export interface TokenCacheOptions {
  /** Per-chain RPC URL overrides (may carry keys; never printed). */
  rpcOverrides?: Record<string, string>;
  /** Re-read facts older than this. */
  maxAgeMs?: number;
  rpc?: RpcCall;
  log?: (line: string) => void;
}

/** Fill `book` with facts for every (chain, asset) pair it lacks or holds stale. Returns how many were read. */
export async function ensureTokens(book: TokenBook, pairs: [string, string][], opts: TokenCacheOptions = {}): Promise<number> {
  const maxAge = opts.maxAgeMs ?? 7 * 24 * 3600 * 1000;
  const rpc = opts.rpc ?? pacedRpc();
  let read = 0;
  const seen = new Set<string>();
  for (const [caip2, asset] of pairs) {
    const key = tokenKey(caip2, asset);
    if (seen.has(key)) continue;
    seen.add(key);
    const have = book[key];
    if (have && !have.error && Date.now() - Date.parse(have.checkedAt) < maxAge) continue;
    const url = opts.rpcOverrides?.[caip2] ?? PUBLIC_RPC[caip2];
    book[key] = await checkAsset(caip2, asset, url, rpc);
    read++;
    const f = book[key]!;
    opts.log?.(`token ${key}: ${f.error ?? `${f.name ?? '?'}/${f.version ?? '?'} code=${f.codeBytes} eip3009=${f.eip3009 ?? '?'}`}`);
  }
  return read;
}
