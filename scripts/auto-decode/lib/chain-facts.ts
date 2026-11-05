// scripts/auto-decode/lib/chain-facts.ts
//
// The chain facts a locked-down run is allowed to know. base.blockscout.com
// answers 403 (Cloudflare) from the ops host, and the brief run has no tools, so
// trusted launcher code reads the chain itself and hands the model a pack: facts
// with ids and source links, plus an `unavailable` list. The model never fetches.
//
// What it reads, and from where (hosts are hard-coded; see assertHost):
//   - JSON-RPC on base-rpc.publicnode.com for state reads and address-filtered
//     logs; base.gateway.tenderly.co for wallet-wide Transfer logs (publicnode
//     refuses eth_getLogs with no address; Tenderly's keyless limit is 1000
//     blocks a call, measured 2026-11-05); mainnet.base.org for transaction
//     receipts (publicnode refuses them) and as the head-block fallback;
//   - GET api.chainward.ai (public reads, no credential unless the optional
//     CW_READ_API_KEY path is switched on by the poller), acpx.virtuals.io (a
//     handle -> wallet lookup) and api.dexscreener.com (token pairs).
//
// What it never does:
//   - touch alchemy.com, or anything the risk-check code uses (riskChainRpcs,
//     SENTINEL_RPC, ALCHEMY_API_KEY): this file reads no environment at all, so a
//     key on the ops host cannot reach the pack or a request;
//   - POST to ChainWard (a POST /api/risk/check would publish a public report on a
//     private buyer's target and spend our check budget);
//   - report a failed read as zero: it goes in `unavailable[]`, and the fact is
//     simply absent.
//
// Text that outsiders write (a token's name(), an ACP agent's description, a
// ChainWard label) is cut to 64 characters and stripped of line breaks before it
// enters the pack, and the pack goes to the model only inside an untrusted block.

import { isRangeLimitError, resolveTarget, scanTransferLogs, type RpcLog, type Target } from '@chainward/decode';

export const CHAIN_FACTS_RPC_HOSTS = ['base-rpc.publicnode.com', 'mainnet.base.org', 'base.gateway.tenderly.co'] as const;
export const CHAIN_FACTS_GET_HOSTS = ['api.chainward.ai', 'acpx.virtuals.io', 'api.dexscreener.com'] as const;

const PRIMARY_RPC = CHAIN_FACTS_RPC_HOSTS[0];
const RECEIPT_RPC = CHAIN_FACTS_RPC_HOSTS[1];
const LOGS_RPC = CHAIN_FACTS_RPC_HOSTS[2];

export class ChainFactsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainFactsError';
  }
}

export interface Fact {
  /** `F1`, `F2`, ...: what a decode cites. */
  id: string;
  label: string;
  value: any;
  /** Where the number can be checked. A BaseScan link for chain reads. */
  source: string;
  /** What to write under Sources: the URL itself when its host may be linked, otherwise plain words. */
  cite: string;
}

export interface Unavailable {
  what: string;
  reason: string;
}

export interface ChainFacts {
  schema: 'chainward-chain-facts/1';
  target: { input: string; address: string; name?: string };
  as_of: { head_block: number; head_time: string; head_age_sec: number; state_block: number };
  facts: Fact[];
  /** Reads that failed. Absent from `facts`, never zero. */
  unavailable: Unavailable[];
  /** What this pack cannot show. */
  limits: string[];
}

export interface ChainFactsDeps {
  fetch: typeof fetch;
  now?: () => number;
  /** Minimum gap between two requests to the same public RPC. Default 500 ms (2 a second). */
  minIntervalMs?: number;
  /** Wait before the one retry of a 429 or 5xx. Default 1500 ms. */
  retryDelayMs?: number;
}

export interface ChainFactsOptions {
  /** Days of Transfer logs to scan. Default 14. */
  windowDays?: number;
  /** Wall-clock budget for the log scan. Default 10 minutes (about 14 days at the pacing below); hitting it truncates, never fails. */
  scanBudgetMs?: number;
  /** Receipts to fetch for sample transactions (decode runs). Default 0. */
  sampleReceipts?: number;
  /** Optional ag_ key for GET /v1/wallet. Sent only to api.chainward.ai. Off by default. */
  readApiKey?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDT = '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2';
const STABLE_DECIMALS = 6;
const ENTRY_POINTS = ['0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', '0x0000000071727de22e5e9d8baf0edac6f37da032'];
const USER_OP_TOPIC = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const SEL = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  owner: '0x8da5cb5b',
  balanceOf: '0x70a08231',
  getOwners: '0xa0e67e2b',
  getThreshold: '0xe75235b8',
} as const;
const CLONE_PREFIX = '0x363d3d373d3d3d363d73';
const CLONE_SUFFIX = '5af43d82803e903d91602b57fd5bf3';
const BASE_BLOCK_SECONDS = 2;
const BLOCKS_PER_DAY = 86_400 / BASE_BLOCK_SECONDS;
// Tenderly's keyless eth_getLogs limit: to - from <= 1000.
const LOG_CHUNK_BLOCKS = 1_000;
// publicnode answers address-filtered logs over wider ranges.
const ENTRY_POINT_CHUNK_BLOCKS = 10_000;
const MIN_CHUNK_BLOCKS = 250;
const STATE_LAG_BLOCKS = 2;
/** A head older than this is a node that has fallen behind: try the other one, then fail. */
const MAX_HEAD_AGE_SEC = 120;
const RPC_TIMEOUT_MS = 20_000;
const GET_TIMEOUT_MS = 20_000;
const MAX_TEXT = 64;
const BASESCAN = 'https://basescan.org';

// ── Outside text ───────────────────────────────────────────────────────────────

// Control characters become a space; format characters (zero-width, bidi
// overrides, soft hyphen) are dropped, so they cannot split a hex run.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const FORMAT_CHARS_RE = /\p{Cf}/gu;
// An address or hash inside outsider text is never carried into the pack: the
// text could be an instruction to pay it, and a copy of it must not count as
// "in the facts" for the grounding check. An address split into groups
// ("0x bad0 0000 ..."), or joined by dashes, dots, markdown, is the same address,
// so hex groups are redacted whatever separates them. Decimal numbers are not
// hex: amounts, block numbers and dates stay.
const SEP = '[\\s\\-_.:,·*`\\[\\]()~]';
const PREFIXED_GROUPS_RE = new RegExp(String.raw`0x[0-9a-f]+(?:${SEP}+[0-9a-f]+(?![0-9a-z]))*`, 'gi');
const BARE_GROUPS_RE = new RegExp(
  String.raw`(?<![0-9a-z])[0-9a-f]+(?![0-9a-z])(?:${SEP}+[0-9a-f]+(?![0-9a-z]))*`,
  'gi',
);
export const HEX_REDACTED = '0x…(redacted)';

function redactHex(text: string): string {
  const out = text.replace(PREFIXED_GROUPS_RE, (m) => (m.replace(/^0x/i, '').replace(new RegExp(SEP, 'g'), '').length >= 6 ? HEX_REDACTED : m));
  return out.replace(BARE_GROUPS_RE, (m) => {
    const joined = m.replace(new RegExp(SEP, 'g'), '');
    if (joined.length < 6 || /^[0-9]+$/.test(joined)) return m; // a decimal number
    return /[0-9]/.test(joined) || joined.length >= 16 ? HEX_REDACTED : m;
  });
}

/** Keys whose values are outsider text (never a structured address, never a source of grounding). */
export const TEXT_KEYS: ReadonlySet<string> = new Set(['name', 'symbol', 'description', 'title', 'subtitle', 'label', 'labels', 'offerings']);
const KEPT_LINK_RE = /^https:\/\/(?:basescan\.org|base\.easscan\.org|chainward\.ai)\/[^\s]*$/;
const HEX_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;

/** One line of outside text, cut to 64 characters. */
export function clipText(text: string, max = MAX_TEXT): string {
  const flat = text
    .normalize('NFKC')
    .replace(FORMAT_CHARS_RE, '')
    .replace(CONTROL_CHARS_RE, ' ')
    .slice(0, 2_000)
    .trim();
  return redactHex(flat).slice(0, max);
}

/**
 * Outside JSON made safe to show: every string cut to 64 characters (hex in it
 * redacted) except a whole-string 0x address or hash that `keepHex` allows for
 * its key, and a link to one of our own explorers; lists cut to 20 entries,
 * objects to 30 keys, depth to 5. Decimal strings pass untouched.
 */
export function clipOutsideDeep(value: unknown, keepHex: (hex: string, key: string) => boolean = () => true, depth = 0, key = ''): unknown {
  if (typeof value === 'string') {
    if (HEX_ID_RE.test(value) && keepHex(value, key)) return value;
    if (value.length <= 200 && KEPT_LINK_RE.test(value) && !TEXT_KEYS.has(key)) return value;
    return clipText(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 5) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clipOutsideDeep(v, keepHex, depth + 1, key));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      // An address used as a map key (counterparties) stays whole, or two keys would collapse into one.
      const outKey = HEX_ID_RE.test(k) ? k : clipText(k, 40);
      out[outKey] = clipOutsideDeep(v, keepHex, depth + 1, k);
    }
    return out;
  }
  return null;
}

// ── Hosts ──────────────────────────────────────────────────────────────────────

function assertHost(url: string, method: 'GET' | 'POST'): URL {
  const u = new URL(url);
  const rpc = (CHAIN_FACTS_RPC_HOSTS as readonly string[]).includes(u.hostname);
  const get = (CHAIN_FACTS_GET_HOSTS as readonly string[]).includes(u.hostname);
  if (u.protocol !== 'https:' || !(method === 'POST' ? rpc : rpc || get) || (method === 'GET' && rpc)) {
    throw new ChainFactsError(`chain facts may not ${method} ${u.hostname}`);
  }
  return u;
}

// ── Public RPC ─────────────────────────────────────────────────────────────────

class RpcRevert extends Error {}

export interface Transport {
  rpc<T>(host: string, method: string, params: unknown[], timeoutMs?: number): Promise<T>;
  get(url: string, headers?: Record<string, string>): Promise<{ status: number; body: unknown }>;
}

export function makeTransport(deps: ChainFactsDeps): Transport {
  const interval = deps.minIntervalMs ?? 500;
  const retryDelay = deps.retryDelayMs ?? 1_500;
  const sleep = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  // One queue per host: each public RPC sees at most 1000 / interval requests a second.
  const gates = new Map<string, Promise<void>>();
  const pace = (host: string): Promise<void> => {
    const gate = (gates.get(host) ?? Promise.resolve()).then(() => sleep(interval));
    gates.set(host, gate);
    return gate;
  };

  async function post(host: string, method: string, params: unknown[], timeoutMs: number): Promise<unknown> {
    const url = assertHost(`https://${host}`, 'POST');
    await pace(url.hostname);
    const res = await deps.fetch(url.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
    if (body.error) {
      // Tenderly puts the reason ("Block range too large") in `data`.
      const detail = typeof body.error.data === 'string' ? ` ${body.error.data}` : '';
      const message = String(body.error.message ?? 'rpc error') + detail;
      if (body.error.code === 3 || /revert/i.test(message)) throw new RpcRevert(message);
      throw new Error(`${method}: ${clipText(message, 120)}`);
    }
    return body.result;
  }

  return {
    async rpc<T>(host: string, method: string, params: unknown[], timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
      try {
        return (await post(host, method, params, timeoutMs)) as T;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // One retry of a rate limit or a server error; a revert or anything else is final.
        if (err instanceof RpcRevert || !/HTTP (429|5\d\d)|timed? ?out|aborted|fetch failed/i.test(msg)) throw err;
        await sleep(retryDelay);
        return (await post(host, method, params, timeoutMs)) as T;
      }
    },
    async get(url, headers = {}) {
      const u = assertHost(url, 'GET');
      const res = await deps.fetch(u.href, {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(GET_TIMEOUT_MS),
        redirect: 'error',
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    },
  };
}

// ── ABI and number helpers ─────────────────────────────────────────────────────

const hex = (n: number): string => '0x' + n.toString(16);
const wordOf = (address: string): string => address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const addressOfWord = (data: string): string => '0x' + data.replace(/^0x/, '').slice(-40).toLowerCase();
const isZeroWord = (data: string): boolean => /^0x0*$/.test(data);

function formatUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

function decodeAbiString(data: string): string | null {
  const body = data.replace(/^0x/, '');
  if (body.length === 64) {
    // bytes32 name (older tokens).
    const text = Buffer.from(body, 'hex').toString('utf8').replace(/\0+$/, '');
    return text.length > 0 ? text : null;
  }
  if (body.length < 128) return null;
  const offset = Number(BigInt('0x' + body.slice(0, 64)));
  const len = Number(BigInt('0x' + body.slice(offset * 2, offset * 2 + 64)));
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(len) || len > 4_096) return null;
  const start = offset * 2 + 64;
  return Buffer.from(body.slice(start, start + len * 2), 'hex').toString('utf8');
}

function decodeAddressArray(data: string): string[] | null {
  const body = data.replace(/^0x/, '');
  if (body.length < 128) return null;
  const offset = Number(BigInt('0x' + body.slice(0, 64)));
  const len = Number(BigInt('0x' + body.slice(offset * 2, offset * 2 + 64)));
  if (!Number.isSafeInteger(len) || len > 50) return null;
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const at = offset * 2 + 64 + i * 64;
    out.push(addressOfWord(body.slice(at, at + 64)));
  }
  return out;
}

// ── The builder ────────────────────────────────────────────────────────────────

interface RawLog extends RpcLog {
  data?: string;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string | number;
  fdv?: number;
  liquidity?: { usd?: number };
}

interface TxReceipt {
  status?: string;
  blockNumber?: string;
  from?: string;
  to?: string;
  gasUsed?: string;
  logs?: RawLog[];
}

interface Move {
  tx: string;
  block: number;
  token: string;
  direction: 'in' | 'out' | 'self';
  counterparty: string;
  raw: bigint;
}

export async function buildChainFacts(
  target: Target,
  deps: ChainFactsDeps,
  options: ChainFactsOptions = {},
): Promise<ChainFacts> {
  const now = deps.now ?? Date.now;
  const net = makeTransport(deps);
  const windowDays = options.windowDays ?? 14;
  const facts: Fact[] = [];
  const unavailable: Unavailable[] = [];

  const add = (label: string, value: unknown, source: string, cite?: string): Fact => {
    const fact: Fact = { id: `F${facts.length + 1}`, label, value, source, cite: cite ?? source };
    facts.push(fact);
    return fact;
  };
  const fail = (what: string, err: unknown): void => {
    if (unavailable.some((u) => u.what === what)) return;
    unavailable.push({ what, reason: clipText(err instanceof Error ? err.message : String(err), 160) });
  };
  const attempt = async <T>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      fail(what, err);
      return undefined;
    }
  };

  // Who: a handle goes through the ACP registry (the wallet it names).
  let address: string;
  let name: string | undefined;
  if (target.kind === 'address') {
    address = target.value.toLowerCase();
  } else {
    try {
      const resolved = await resolveTarget(target, {
        fetch: ((url: string) => deps.fetch(assertHost(url, 'GET').href, { redirect: 'error' })) as typeof fetch,
      });
      address = resolved.address.toLowerCase();
      if (resolved.name) name = clipText(resolved.name);
    } catch (err) {
      throw new ChainFactsError(`could not resolve the handle: ${clipText(err instanceof Error ? err.message : String(err), 120)}`);
    }
  }
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new ChainFactsError('target is not an address');

  // The head. Without it nothing below can be dated, so this is the one hard failure.
  const readHead = async (): Promise<{ number: number; timestamp: number; ageSec: number }> => {
    let lastErr: unknown;
    for (const host of [PRIMARY_RPC, RECEIPT_RPC]) {
      try {
        const number = parseInt(await net.rpc<string>(host, 'eth_blockNumber', []), 16);
        const block = await net.rpc<{ timestamp: string }>(host, 'eth_getBlockByNumber', [hex(number), false]);
        const timestamp = parseInt(block.timestamp, 16);
        if (!Number.isFinite(number) || !Number.isFinite(timestamp)) throw new Error('unreadable head block');
        // The age of the head when we read it: a long scan afterwards does not make it older.
        const ageSec = Math.max(0, Math.round(now() / 1000 - timestamp));
        if (ageSec > MAX_HEAD_AGE_SEC) throw new Error(`head block is ${ageSec} s old`);
        return { number, timestamp, ageSec };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };
  let head: { number: number; timestamp: number; ageSec: number };
  try {
    head = await readHead();
  } catch (err) {
    throw new ChainFactsError(`could not read the head block: ${clipText(err instanceof Error ? err.message : String(err), 120)}`);
  }
  const headAgeSec = head.ageSec;
  const stateBlock = head.number - STATE_LAG_BLOCKS;
  const tag = hex(stateBlock);
  const approxTime = (block: number): string =>
    new Date((head.timestamp - (head.number - block) * BASE_BLOCK_SECONDS) * 1000).toISOString();

  const rpc = <T>(method: string, params: unknown[]): Promise<T> => net.rpc<T>(PRIMARY_RPC, method, params);
  const call = (to: string, data: string): Promise<string> => rpc<string>('eth_call', [{ to, data }, tag]);
  /** A view call: null when the contract has no such function, throws on a failed read. */
  const probe = async (to: string, data: string): Promise<string | null> => {
    try {
      const out = await call(to, data);
      return typeof out === 'string' && out.length > 2 ? out : null;
    } catch (err) {
      if (err instanceof RpcRevert) return null;
      throw err;
    }
  };

  const addressSource = `${BASESCAN}/address/${address}`;

  // Code and type.
  const code = await attempt('account_type', () => rpc<string>('eth_getCode', [address, tag]));
  let isContract = false;
  let cloneImplementation: string | null = null;
  if (code !== undefined) {
    const lower = code.toLowerCase();
    if (lower === '0x') {
      add('account_type', { type: 'eoa' }, addressSource);
    } else if (lower.startsWith('0xef0100') && lower.length === 8 + 40) {
      add('account_type', { type: 'eip7702_delegated', delegate: '0x' + lower.slice(8) }, addressSource);
      isContract = true;
    } else {
      add('account_type', { type: 'contract', code_bytes: (lower.length - 2) / 2 }, addressSource);
      isContract = true;
      if (lower.startsWith(CLONE_PREFIX) && lower.endsWith(CLONE_SUFFIX) && lower.length === CLONE_PREFIX.length + 40 + CLONE_SUFFIX.length) {
        cloneImplementation = '0x' + lower.slice(CLONE_PREFIX.length, CLONE_PREFIX.length + 40);
      }
    }
  }

  // Nonce and balances, all at the same block.
  const nonce = await attempt('nonce', async () => parseInt(await rpc<string>('eth_getTransactionCount', [address, tag]), 16));
  if (nonce !== undefined) add('nonce', nonce, addressSource);
  const wei = await attempt('eth_balance', async () => BigInt(await rpc<string>('eth_getBalance', [address, tag])));
  if (wei !== undefined) add('eth_balance', { wei: wei.toString(), eth: formatUnits(wei, 18) }, addressSource);
  for (const [symbol, token] of [['USDC', USDC], ['USDT', USDT]] as const) {
    const label = `${symbol.toLowerCase()}_balance`;
    const raw = await attempt(label, async () => BigInt(await call(token, SEL.balanceOf + wordOf(address))));
    if (raw !== undefined) add(label, { raw: raw.toString(), amount: formatUnits(raw, STABLE_DECIMALS) }, `${BASESCAN}/token/${token}?a=${address}`);
  }

  // Contract facts: proxy, Safe, ERC-20, owner.
  let tokenFacts = false;
  if (isContract && code !== undefined && !code.toLowerCase().startsWith('0xef0100')) {
    if (cloneImplementation) {
      add('proxy', { standard: 'minimal_clone', implementation: cloneImplementation }, addressSource);
    } else {
      const impl = await attempt('proxy', () => rpc<string>('eth_getStorageAt', [address, IMPL_SLOT, tag]));
      if (impl !== undefined && !isZeroWord(impl)) {
        const admin = await attempt('proxy_admin', () => rpc<string>('eth_getStorageAt', [address, ADMIN_SLOT, tag]));
        add(
          'proxy',
          { standard: 'eip1967', implementation: addressOfWord(impl), admin: admin !== undefined && !isZeroWord(admin) ? addressOfWord(admin) : null },
          addressSource,
        );
      }
    }

    const owners = await attempt('safe', () => probe(address, SEL.getOwners));
    if (owners) {
      const list = decodeAddressArray(owners);
      const threshold = await attempt('safe', () => probe(address, SEL.getThreshold));
      if (list && threshold) add('safe', { owners: list, threshold: Number(BigInt(threshold)) }, addressSource);
    }

    const decimalsRaw = await attempt('erc20', () => probe(address, SEL.decimals));
    const symbolRaw = decimalsRaw ? await attempt('erc20', () => probe(address, SEL.symbol)) : null;
    const ownerRaw = await attempt('owner', () => probe(address, SEL.owner));
    const owner = ownerRaw && !isZeroWord(ownerRaw) ? addressOfWord(ownerRaw) : null;
    if (decimalsRaw && symbolRaw) {
      const decimals = Number(BigInt(decimalsRaw));
      const nameRaw = await attempt('erc20', () => probe(address, SEL.name));
      const supplyRaw = await attempt('erc20', () => probe(address, SEL.totalSupply));
      tokenFacts = true;
      add(
        'erc20',
        {
          name: nameRaw ? clipText(decodeAbiString(nameRaw) ?? '') : null,
          symbol: clipText(decodeAbiString(symbolRaw) ?? ''),
          decimals,
          total_supply: supplyRaw ? formatUnits(BigInt(supplyRaw), decimals) : null,
          total_supply_raw: supplyRaw ? BigInt(supplyRaw).toString() : null,
          owner,
        },
        `${BASESCAN}/token/${address}`,
      );
    } else if (owner) {
      add('owner', { address: owner }, addressSource);
    }
  }

  // The window and the Transfer-log scan.
  const fromBlock = Math.max(0, stateBlock - Math.round(windowDays * BLOCKS_PER_DAY));
  const daysCovered = (scannedFrom: number, to = stateBlock): number =>
    Math.min(windowDays, Math.round((((to - scannedFrom + 1) * BASE_BLOCK_SECONDS) / 86_400) * 100) / 100);
  let sampleTxs: string[] = [];
  // Every eth_getLogs range the scan asked for, and whether both of its queries answered.
  const chunkLog = new Map<string, { calls: number; failed: boolean }>();
  const scan = await attempt('transfer_scan', () =>
    scanTransferLogs({
      address,
      rpcUrl: `https://${LOGS_RPC}`,
      fromBlock,
      toBlock: stateBlock,
      chunkBlocks: LOG_CHUNK_BLOCKS,
      timeoutMs: RPC_TIMEOUT_MS,
      rpcCall: async (url, method, params, timeoutMs) => {
        const f = method === 'eth_getLogs' ? (params[0] as { fromBlock: string; toBlock: string }) : null;
        const key = f ? `${parseInt(f.fromBlock, 16)}-${parseInt(f.toBlock, 16)}` : '';
        const entry = f ? (chunkLog.get(key) ?? { calls: 0, failed: false }) : null;
        if (f && entry) chunkLog.set(key, entry);
        try {
          const result = await net.rpc<unknown>(new URL(url).hostname, method, params, timeoutMs);
          // A node that answers null has not said "no logs": it has not answered.
          if (f && !Array.isArray(result)) throw new Error('eth_getLogs: the answer was not a list');
          if (entry) entry.calls += 1;
          return result;
        } catch (err) {
          if (entry) entry.failed = true;
          throw err;
        }
      },
      concurrency: 4,
      budgetMs: options.scanBudgetMs ?? 10 * 60_000,
      maxLogs: 6_000,
      now,
    }),
  );
  if (scan) {
    // scanTransferLogs reports the lowest block any chunk answered for, even past a
    // chunk that failed. Coverage here is only the unbroken run of answered ranges.
    const answered: Array<[number, number]> = [];
    const failedRanges: Array<[number, number]> = [];
    for (const [key, entry] of chunkLog) {
      const [lo, hi] = key.split('-').map(Number) as [number, number];
      if (!entry.failed && entry.calls >= 2) answered.push([lo, hi]);
      else failedRanges.push([lo, hi]);
    }
    const coveredTo = answered.length > 0 ? Math.max(...answered.map(([, hi]) => hi)) : stateBlock;
    let coveredFrom = coveredTo + 1;
    for (let moved = true; moved; ) {
      moved = false;
      for (const [lo, hi] of answered) {
        if (hi >= coveredFrom - 1 && lo < coveredFrom) {
          coveredFrom = lo;
          moved = true;
        }
      }
    }
    // The parts of the failed ranges that no answered range covers.
    const merged = [...answered].sort((a, b) => a[0] - b[0]).reduce<Array<[number, number]>>((acc, [lo, hi]) => {
      const last = acc[acc.length - 1];
      if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
      else acc.push([lo, hi]);
      return acc;
    }, []);
    const gaps: Array<[number, number]> = [];
    for (const [flo, fhi] of failedRanges) {
      let pieces: Array<[number, number]> = [[flo, fhi]];
      for (const [mlo, mhi] of merged) {
        pieces = pieces.flatMap(([a, b]): Array<[number, number]> => {
          if (mhi < a || mlo > b) return [[a, b]];
          const out: Array<[number, number]> = [];
          if (a < mlo) out.push([a, mlo - 1]);
          if (b > mhi) out.push([mhi + 1, b]);
          return out;
        });
      }
      gaps.push(...pieces);
    }
    if (gaps.length > 0) {
      const lowest = Math.min(...gaps.map(([a]) => a));
      const highest = Math.max(...gaps.map(([, b]) => b));
      fail('transfer_scan_gap', new Error(`blocks ${lowest} to ${highest} could not be read (${gaps.length} failed range${gaps.length === 1 ? '' : 's'}); nothing below block ${coveredFrom} is counted`));
    }
    const scannedFromBlock = coveredFrom;
    const seen = new Set<string>();
    const moves: Move[] = [];
    const otherTokens = new Map<string, number>();
    for (const log of scan.logs as RawLog[]) {
      if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue; // fungible ERC-20 only
      const logBlock = parseInt(log.blockNumber, 16);
      if (logBlock < scannedFromBlock || logBlock > coveredTo) continue; // outside the stated window
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const from = addressOfWord(log.topics[1]!);
      const to = addressOfWord(log.topics[2]!);
      const direction = from === address && to === address ? 'self' : from === address ? 'out' : 'in';
      moves.push({
        tx: log.transactionHash,
        block: parseInt(log.blockNumber, 16),
        token: log.address.toLowerCase(),
        direction,
        counterparty: direction === 'in' ? from : to,
        raw: BigInt(log.data && /^0x[0-9a-f]*$/i.test(log.data) && log.data.length > 2 ? log.data.slice(0, 66) : '0x0'),
      });
    }
    const stable = (token: string) => {
      const mine = moves.filter((m) => m.token === token);
      const sum = (dir: string) => mine.filter((m) => m.direction === dir).reduce((a, m) => a + m.raw, 0n);
      return {
        in_count: mine.filter((m) => m.direction === 'in').length,
        out_count: mine.filter((m) => m.direction === 'out').length,
        in_total: formatUnits(sum('in'), STABLE_DECIMALS),
        out_total: formatUnits(sum('out'), STABLE_DECIMALS),
      };
    };
    for (const m of moves) if (m.token !== USDC && m.token !== USDT) otherTokens.set(m.token, (otherTokens.get(m.token) ?? 0) + 1);

    const byCounterparty = new Map<string, { transfers: number; in: number; out: number }>();
    for (const m of moves) {
      const row = byCounterparty.get(m.counterparty) ?? { transfers: 0, in: 0, out: 0 };
      row.transfers += 1;
      if (m.direction === 'in') row.in += 1;
      else if (m.direction === 'out') row.out += 1;
      byCounterparty.set(m.counterparty, row);
    }
    const byValue = moves
      .filter((m) => m.token === USDC || m.token === USDT)
      .sort((a, b) => (a.raw === b.raw ? b.block - a.block : a.raw > b.raw ? -1 : 1))
      .slice(0, 10);
    const newestFirst = [...moves].sort((a, b) => b.block - a.block);
    sampleTxs = [...new Set([...byValue, ...newestFirst].map((m) => m.tx))];

    const truncated = scan.truncated || scannedFromBlock > fromBlock;
    add(
      'transfer_scan',
      {
        window: {
          days_requested: windowDays,
          days_covered: truncated ? daysCovered(scannedFromBlock, coveredTo) : windowDays,
          from_block: fromBlock,
          scanned_from_block: scannedFromBlock,
          to_block: coveredTo,
          truncated,
          rpc: LOGS_RPC,
        },
        total_transfers: moves.length,
        usdc: stable(USDC),
        usdt: stable(USDT),
        other_token_transfers: [...otherTokens.values()].reduce((a, b) => a + b, 0),
        other_tokens_distinct: otherTokens.size,
        top_tokens: [...otherTokens.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([token, count]) => ({ address: token, transfers: count })),
        top_counterparties: [...byCounterparty.entries()]
          .sort((a, b) => b[1].transfers - a[1].transfers || a[0].localeCompare(b[0]))
          .slice(0, 10)
          .map(([counterparty, row]) => ({ address: counterparty, ...row })),
        largest_moves: byValue.map((m) => ({
          tx: m.tx,
          block: m.block,
          approx_time: approxTime(m.block),
          token: m.token === USDC ? 'USDC' : 'USDT',
          direction: m.direction,
          counterparty: m.counterparty,
          amount: formatUnits(m.raw, STABLE_DECIMALS),
        })),
      },
      addressSource,
    );
  }

  // ERC-4337 user operations the account sent (both EntryPoint versions), same window.
  if (isContract) {
    const ops = await attempt('erc4337_user_operations', async () => {
      const deadline = now() + (options.scanBudgetMs ?? 10 * 60_000);
      let size = ENTRY_POINT_CHUNK_BLOCKS;
      let count = 0;
      let scannedFrom = stateBlock + 1;
      let end = stateBlock;
      while (end >= fromBlock) {
        const start = Math.max(fromBlock, end - size + 1);
        try {
          const logs = await rpc<unknown[]>('eth_getLogs', [
            { fromBlock: hex(start), toBlock: hex(end), address: ENTRY_POINTS, topics: [USER_OP_TOPIC, null, '0x' + wordOf(address)] },
          ]);
          if (!Array.isArray(logs)) throw new Error('eth_getLogs: the answer was not a list');
          count += logs.length;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (size > MIN_CHUNK_BLOCKS && isRangeLimitError(msg)) {
            size = Math.max(MIN_CHUNK_BLOCKS, Math.floor(size / 2));
            continue;
          }
          throw err;
        }
        scannedFrom = start;
        end = start - 1;
        if (end >= fromBlock && now() >= deadline) break;
      }
      return { count, scannedFrom };
    });
    if (ops) {
      const complete = ops.scannedFrom <= fromBlock;
      add(
        'erc4337_user_operations',
        { count: ops.count, window_days: complete ? windowDays : daysCovered(ops.scannedFrom), complete },
        addressSource,
      );
    }
  }

  // DEX pairs for a token.
  if (tokenFacts) {
    const dex = await attempt('dex_pairs', async () => {
      const res = await net.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const pairs = (res.body as { pairs?: unknown[] } | null)?.pairs;
      return Array.isArray(pairs) ? (pairs as DexPair[]) : [];
    });
    if (dex) {
      const base = dex
        .filter((p) => p?.chainId === 'base')
        .sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))
        .slice(0, 3)
        .map((p) => ({
          dex: clipText(String(p.dexId ?? '')),
          pair: typeof p.pairAddress === 'string' && HEX_ID_RE.test(p.pairAddress) ? p.pairAddress.toLowerCase() : null,
          liquidity_usd: typeof p.liquidity?.usd === 'number' ? p.liquidity.usd : null,
          fdv_usd: typeof p.fdv === 'number' ? p.fdv : null,
          price_usd: p.priceUsd === undefined ? null : clipText(String(p.priceUsd), 24),
        }));
      const url = `https://dexscreener.com/base/${address}`;
      add('dex_pairs', base, url);
    }
  }

  // ChainWard's own public reads. A 404 is an answer ("none"); anything else is a failed read.
  const cwHeaders: Record<string, string> = options.readApiKey ? { Authorization: `Bearer ${options.readApiKey}` } : {};
  const chainwardReads: Array<[string, string]> = [
    ['chainward_lookup', `/api/observatory/lookup/${address}`],
    ['chainward_economics', `/api/observatory/economics/${address}`],
    ['chainward_decodes', `/api/public/decodes/lookup/${address}`],
    ['chainward_attestation', `/api/risk/attestation/${address}`],
    ['chainward_risk_report', `/api/risk/report/${address}`],
    ...(options.readApiKey ? ([['chainward_wallet', `/v1/wallet/${address}?chain=base`]] as Array<[string, string]>) : []),
  ];
  for (const [label, path] of chainwardReads) {
    const url = `https://api.chainward.ai${path}`;
    const answer = await attempt(label, async () => {
      const res = await net.get(url, cwHeaders);
      if (res.status === 404) return { status: 'none' };
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body = res.body as { success?: boolean; data?: unknown } | null;
      if (!body || body.success === false) throw new Error('unexpected answer');
      // ChainWard's structured addresses stay (grounding ignores these facts); text fields lose theirs.
      return clipOutsideDeep(body.data, (_h, key) => !TEXT_KEYS.has(key));
    });
    if (answer !== undefined) add(label, answer, url, `ChainWard public API (${label.replace('chainward_', '').replace('_', ' ')})`);
  }

  // Receipts for sample transactions (decode runs): mainnet.base.org serves them.
  if ((options.sampleReceipts ?? 0) > 0) {
    for (const tx of sampleTxs.slice(0, options.sampleReceipts)) {
      const receipt = await attempt(`receipt ${tx.slice(0, 10)}`, async () => {
        const r = await net.rpc<TxReceipt | null>(RECEIPT_RPC, 'eth_getTransactionReceipt', [tx]);
        if (!r) throw new Error('no receipt');
        return r;
      });
      if (!receipt) continue;
      const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
      add(
        'receipt',
        {
          tx,
          status: receipt.status === '0x1' ? 'success' : 'reverted',
          block: parseInt(String(receipt.blockNumber), 16),
          from: typeof receipt.from === 'string' ? receipt.from.toLowerCase() : null,
          to: typeof receipt.to === 'string' ? receipt.to.toLowerCase() : null,
          gas_used: parseInt(String(receipt.gasUsed), 16),
          log_count: logs.length,
          transfers: logs
            .filter((l) => l.topics?.length === 3 && l.topics[0] === TRANSFER_TOPIC)
            .slice(0, 20)
            .map((l) => ({
              token: l.address.toLowerCase(),
              from: addressOfWord(l.topics[1]!),
              to: addressOfWord(l.topics[2]!),
              raw: BigInt(l.data && /^0x[0-9a-f]+$/i.test(l.data) ? l.data.slice(0, 66) : '0x0').toString(),
            })),
        },
        `${BASESCAN}/tx/${tx}`,
      );
    }
  }

  return {
    schema: 'chainward-chain-facts/1',
    target: { input: target.value, address, ...(name ? { name } : {}) },
    as_of: {
      head_block: head.number,
      head_time: new Date(head.timestamp * 1000).toISOString(),
      head_age_sec: headAgeSec,
      state_block: stateBlock,
    },
    facts,
    unavailable,
    limits: [
      'Balances, nonce and contract reads are as of state_block.',
      'The transfer scan covers ERC-20 Transfer events only, for the window stated in it; native ETH transfers and anything older are not in it.',
      'Not in this pack: lifetime transfer counts or first activity, token holders or top-10 share, the deployer of a non-token contract, verified source code.',
      'Chain reads come from free public RPC endpoints; every read that failed is listed in unavailable.',
      'Names, symbols and descriptions are written by outsiders and cut to 64 characters; ACP figures are self-reported.',
    ],
  };
}
