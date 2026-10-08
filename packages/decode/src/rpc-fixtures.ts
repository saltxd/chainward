import {
  RISK_CHAINS,
  deriveNodeHead,
  getMaxHeadLagSec,
  riskChainExplorerApiKey,
  riskChainRpcs,
  type RiskChainId,
  type RiskChainRpc,
} from '@chainward/common';
import {
  TRANSFER_TOPIC,
  addressTopic,
  jsonRpcResult,
  mapLogsToTransfers,
  type FetchLogger,
  type FetchedFixtures,
  type NodeTransfer,
  type RpcLog,
} from './data-fetch.js';

/**
 * Fixtures for a chain we read through PUBLIC JSON-RPC ONLY — no Blockscout, no
 * own node, no ACP. Today that is BNB Chain. Produces the same fixture shape the
 * Base path does (`FetchedFixtures`) so computeQuickDecodeData / deriveRiskFlags
 * run unchanged, plus the window it actually covered so the report can say so.
 *
 * The transfer list comes from eth_getLogs on the ERC-20 Transfer topic with the
 * wallet as `from` and as `to`, over a bounded recent window (default 14 days,
 * `RISK_RPC_WINDOW_DAYS`), chunked to each endpoint's measured span limit and
 * scanned newest-first under a wall-clock budget. Anything past the window is
 * not seen — the report records `window_days` and says so under not_assessed.
 *
 * With a BscScan key (`BSCSCAN_API_KEY`) the transfer list comes from the
 * explorer API instead (exact timestamps, 30-day window); the RPC scan is the
 * fallback. Balances / code / nonce always come from RPC.
 */

export const DEFAULT_RPC_WINDOW_DAYS = 14;
// Measured 2026-10-03 on rpc.sentio.xyz/bsc: 8 parallel eth_getLogs calls return in
// the same ~250-800ms as 4; 16+ degrades. A 14-day window is ~540 calls at the
// 10k-block cap, so 45s covers it at the fast end and truncates (honestly) otherwise.
const DEFAULT_SCAN_BUDGET_MS = 45_000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MAX_TRANSFERS = 2_000;
const DEFAULT_CACHE_TTL_SEC = 600;
const MIN_CHUNK_BLOCKS = 250;
const BLOCK_TIME_SAMPLE_SPAN = 100_000;
/** Blocks held back from the head so a multi-node RPC pool never serves "beyond latest". */
const HEAD_SAFETY_LAG = 2;
const ACTIVITY_WINDOW_DAYS = 30;
const EXPLORER_PAGE_SIZE = 1_000;
const EXPLORER_MAX_PAGES = 5;
const TOKEN_BALANCE_CHECK_CAP = 20;
const BALANCE_OF_SELECTOR = '0x70a08231';

export type RpcCall = (url: string, method: string, params: unknown[], timeoutMs: number) => Promise<unknown>;

/** Minimal cache contract (ioredis get/set EX adapts to this in one line). */
export interface RpcFixtureCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<unknown>;
}

export interface RpcFetchOptions {
  fetchTimeoutMs: number;
  /**
   * Cache namespace. The API's quick precheck (1-day window, short budget) and the
   * worker's full scan must not share an entry; the key carries the window days.
   */
  windowDays?: number;
  /** Ordered RPC list; defaults to the chain registry (env-aware). */
  rpcs?: RiskChainRpc[];
  /** Wall-clock budget for the whole log scan; hitting it truncates, never fails. */
  scanBudgetMs?: number;
  /** Chunks in flight at once. */
  concurrency?: number;
  /** Cap on kept transfers (newest first). */
  maxTransfers?: number;
  maxHeadLagSec?: number;
  /** Explorer API key (BscScan). Defaults to the chain's env var. `null` disables. */
  explorerApiKey?: string | null;
  cache?: RpcFixtureCache;
  cacheTtlSec?: number;
  logger?: FetchLogger;
  /** Injectable JSON-RPC transport (tests). */
  rpcCall?: RpcCall;
  /** Injectable HTTP fetch for the explorer API (tests). */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface ScanWindow {
  /**
   * Days of history the scan ACTUALLY covered — what the report may call "the
   * checked window". Equals `requested_days` unless the scan stopped early.
   */
  days: number;
  /** Days asked for (`RISK_RPC_WINDOW_DAYS` / the explorer's 30-day horizon). */
  requested_days: number;
  from_block: number;
  to_block: number;
  /** Measured seconds per block over the sample span, used to date the logs. */
  block_seconds: number;
  source: 'rpc_logs' | 'explorer_api';
  /** True when the scan stopped early (budget, cap, or a failing deep chunk). */
  truncated: boolean;
  /** Oldest block actually scanned (>= from_block when truncated). */
  scanned_from_block: number;
  rpc_url: string;
}

export interface RpcFixtures extends FetchedFixtures {
  chain: RiskChainId;
  window: ScanWindow;
  /** Raw uint256 hex per stablecoin symbol (USDC, USDT). */
  stablecoin_balances: Record<string, string>;
  /** Distinct tokens with an inbound transfer in the window and a non-zero balance now. */
  token_count: number;
  /** True when more tokens were seen than we checked balances for. */
  token_count_lower_bound: boolean;
  fetched_at: string;
}

export interface LogChunk {
  from: number;
  to: number;
}

/**
 * Pure: newest-first inclusive block chunks covering [fromBlock, toBlock], each
 * spanning at most `chunkBlocks - 1` (so `to - from < chunkBlocks`, which is what
 * span-limited endpoints enforce).
 */
export function planLogChunks(fromBlock: number, toBlock: number, chunkBlocks: number): LogChunk[] {
  const size = Math.max(1, Math.floor(chunkBlocks));
  const chunks: LogChunk[] = [];
  for (let end = toBlock; end >= fromBlock; end -= size) {
    chunks.push({ from: Math.max(fromBlock, end - size + 1), to: end });
  }
  return chunks;
}

/** Pure: does an eth_getLogs error mean "range too wide", i.e. halve and retry? */
export function isRangeLimitError(message: string): boolean {
  return /span|range|limit|too (many|large)|response size|exceed|max(imum)? allowed|requested blocks|10000|timed? ?out/i.test(
    message,
  );
}

/** Pure: is this the "block beyond latest" race from a multi-node RPC pool? */
export function isHeadRaceError(message: string): boolean {
  return /beyond the latest block|block not found|unknown block|header not found/i.test(message);
}

export interface ScanLogsInput {
  address: string;
  rpcUrl: string;
  fromBlock: number;
  toBlock: number;
  chunkBlocks: number;
  timeoutMs: number;
  rpcCall: RpcCall;
  concurrency?: number;
  budgetMs?: number;
  /** Stop scanning deeper once this many raw logs are in hand. */
  maxLogs?: number;
  now?: () => number;
  logger?: FetchLogger;
}

export interface ScanLogsResult {
  logs: RpcLog[];
  truncated: boolean;
  scannedFromBlock: number;
  chunkBlocksUsed: number;
}

async function getLogs(
  rpcCall: RpcCall,
  rpcUrl: string,
  chunk: LogChunk,
  topics: (string | null)[],
  timeoutMs: number,
): Promise<RpcLog[]> {
  const res = await rpcCall(
    rpcUrl,
    'eth_getLogs',
    [{ fromBlock: '0x' + chunk.from.toString(16), toBlock: '0x' + chunk.to.toString(16), topics }],
    timeoutMs,
  );
  return Array.isArray(res) ? (res as RpcLog[]) : [];
}

/**
 * Chunked, newest-first eth_getLogs scan for Transfer logs where the address is
 * the sender or the recipient. Adapts to the endpoint: a range-limit error
 * halves the chunk and re-plans the remaining region; any other error is retried
 * once, then (if recent chunks already succeeded) truncates the scan instead of
 * failing it. Throws only when the NEWEST chunk cannot be read at all, so the
 * caller can move to the next RPC.
 */
export async function scanTransferLogs(input: ScanLogsInput): Promise<ScanLogsResult> {
  const now = input.now ?? Date.now;
  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY);
  const budgetMs = input.budgetMs ?? DEFAULT_SCAN_BUDGET_MS;
  const maxLogs = input.maxLogs ?? DEFAULT_MAX_TRANSFERS * 3;
  const topic = addressTopic(input.address);
  const deadline = now() + budgetMs;

  let chunkBlocks = Math.max(MIN_CHUNK_BLOCKS, input.chunkBlocks);
  let pending = planLogChunks(input.fromBlock, input.toBlock, chunkBlocks);
  const logs: RpcLog[] = [];
  let scannedFromBlock = input.toBlock + 1;
  let scannedAny = false;
  let truncated = false;

  const scanChunk = async (chunk: LogChunk): Promise<RpcLog[]> => {
    const [fromLogs, toLogs] = await Promise.all([
      getLogs(input.rpcCall, input.rpcUrl, chunk, [TRANSFER_TOPIC, topic], input.timeoutMs),
      getLogs(input.rpcCall, input.rpcUrl, chunk, [TRANSFER_TOPIC, null, topic], input.timeoutMs),
    ]);
    return [...fromLogs, ...toLogs];
  };

  while (pending.length > 0) {
    const batch = pending.slice(0, concurrency);
    const results = await Promise.allSettled(batch.map(scanChunk));

    let halve = false;
    let hardFail: unknown = null;
    const retry: LogChunk[] = [];
    results.forEach((r, i) => {
      const chunk = batch[i]!;
      if (r.status === 'fulfilled') {
        logs.push(...r.value);
        scannedFromBlock = Math.min(scannedFromBlock, chunk.from);
        scannedAny = true;
        return;
      }
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (isRangeLimitError(msg) && chunkBlocks > MIN_CHUNK_BLOCKS) {
        halve = true;
        retry.push(chunk);
      } else if (isHeadRaceError(msg) && chunk.to === input.toBlock) {
        // The pool's node is a block or two behind the head we probed — trim and retry.
        retry.push({ from: chunk.from, to: chunk.to - HEAD_SAFETY_LAG });
      } else {
        hardFail = r.reason;
      }
    });

    if (hardFail) {
      if (!scannedAny) throw hardFail instanceof Error ? hardFail : new Error(String(hardFail));
      input.logger?.warn(
        { err: hardFail instanceof Error ? hardFail.message : String(hardFail), scannedFromBlock },
        'rpc-fixtures: deep chunk failed; truncating scan',
      );
      truncated = true;
      break;
    }

    const rest = pending.slice(batch.length);
    if (halve) {
      chunkBlocks = Math.max(MIN_CHUNK_BLOCKS, Math.floor(chunkBlocks / 2));
      input.logger?.warn({ chunkBlocks, rpc: input.rpcUrl }, 'rpc-fixtures: range limit hit; halving chunk');
      // Re-plan every unscanned block (the failed chunks + what was still queued)
      // with the smaller chunk, newest first.
      const unscannedTo = Math.max(...retry.map((c) => c.to), ...(rest.length ? [rest[0]!.to] : [-1]));
      const unscannedFrom = Math.min(...retry.map((c) => c.from), ...(rest.length ? [rest[rest.length - 1]!.from] : [Infinity]));
      pending = unscannedTo >= unscannedFrom ? planLogChunks(unscannedFrom, unscannedTo, chunkBlocks) : [];
    } else {
      pending = [...retry, ...rest];
    }

    if (logs.length >= maxLogs) {
      truncated = pending.length > 0;
      break;
    }
    if (pending.length > 0 && now() >= deadline) {
      input.logger?.warn({ scannedFromBlock, budgetMs }, 'rpc-fixtures: scan budget hit; truncating');
      truncated = true;
      break;
    }
  }

  return { logs, truncated, scannedFromBlock: Math.min(scannedFromBlock, input.toBlock), chunkBlocksUsed: chunkBlocks };
}

// ── Explorer API (BscScan via the Etherscan v2 endpoint) ─────────────────────

interface ExplorerTokenTx {
  from: string;
  to: string;
  timeStamp: string;
  contractAddress: string;
  hash: string;
}

/**
 * Transfer list from the Etherscan-family API, newest first, until the 30-day
 * window is covered or the page cap is hit. Throws on any API failure so the
 * caller falls back to RPC logs.
 */
export async function fetchExplorerTransfers(
  chain: RiskChainId,
  address: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<{ items: NodeTransfer[]; truncated: boolean }> {
  const api = RISK_CHAINS[chain].explorer.api;
  if (!api) throw new Error(`explorer api: none configured for ${chain}`);
  const cutoffSec = Math.floor(nowMs / 1000) - ACTIVITY_WINDOW_DAYS * 86_400;
  const items: NodeTransfer[] = [];
  let truncated = false;

  for (let page = 1; page <= EXPLORER_MAX_PAGES; page++) {
    const url =
      `${api.url}?chainid=${api.chainId}&module=account&action=tokentx&address=${address}` +
      `&page=${page}&offset=${EXPLORER_PAGE_SIZE}&sort=desc&apikey=${encodeURIComponent(apiKey)}`;
    const resp = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) throw new Error(`explorer api: HTTP ${resp.status}`);
    const body = (await resp.json()) as { status?: string; message?: string; result?: unknown };
    if (!Array.isArray(body.result)) {
      // "No transactions found" is status 0 with an empty/str result — a real empty answer.
      if (body.message && /no transactions found/i.test(body.message)) break;
      throw new Error(`explorer api: ${body.message ?? 'unexpected response'}`);
    }
    const rows = body.result as ExplorerTokenTx[];
    for (const r of rows) {
      items.push({
        from: { hash: r.from.toLowerCase() },
        to: { hash: r.to.toLowerCase() },
        timestamp: new Date(parseInt(r.timeStamp, 10) * 1000).toISOString(),
        token: { address: r.contractAddress.toLowerCase() },
      });
    }
    if (rows.length < EXPLORER_PAGE_SIZE) break;
    const oldest = rows[rows.length - 1]!;
    if (parseInt(oldest.timeStamp, 10) < cutoffSec) break;
    if (page === EXPLORER_MAX_PAGES) truncated = true;
  }
  return { items, truncated };
}

// ── Fixture assembly ─────────────────────────────────────────────────────────

function envNumber(name: string): number | undefined {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Days of history the full scan asks for: `RISK_RPC_WINDOW_DAYS`, default 14. */
export function defaultRpcWindowDays(): number {
  return envNumber('RISK_RPC_WINDOW_DAYS') ?? DEFAULT_RPC_WINDOW_DAYS;
}

/** Wall-clock budget for the full scan: `RISK_RPC_SCAN_BUDGET_MS`, default 45s. */
export function defaultRpcScanBudgetMs(): number {
  return envNumber('RISK_RPC_SCAN_BUDGET_MS') ?? DEFAULT_SCAN_BUDGET_MS;
}

/** Chunks in flight for the scan: `RISK_RPC_SCAN_CONCURRENCY`, default 8. */
export function defaultRpcScanConcurrency(): number {
  return envNumber('RISK_RPC_SCAN_CONCURRENCY') ?? DEFAULT_CONCURRENCY;
}

function windowDaysFor(opts: RpcFetchOptions): number {
  return opts.windowDays ?? defaultRpcWindowDays();
}

function cacheKey(chain: RiskChainId, address: string, windowDays: number): string {
  return `risk:rpcfx:${chain}:${address.toLowerCase()}:${windowDays}d`;
}

/**
 * Human window length as an adjective ("14-day", "4.6-day", "9-hour"). Whole
 * days stay whole; a partial scan keeps one decimal so 4.6 days never reads as
 * 5; under a day it is hours. Mirrors windowLabel in apps/web/src/lib/risk.ts.
 */
export function formatWindowDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}-hour`;
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}-day` : `${rounded.toFixed(1)}-day`;
}

/** The same span as a noun phrase ("14 days", "4.6 days", "9 hours"). */
export function formatWindowSpan(days: number): string {
  const adj = formatWindowDays(days);
  const [n, unit] = adj.split('-');
  return `${n} ${unit}${n === '1' ? '' : 's'}`;
}

async function readCached(chain: RiskChainId, address: string, opts: RpcFetchOptions): Promise<RpcFixtures | null> {
  if (!opts.cache) return null;
  try {
    const raw = await opts.cache.get(cacheKey(chain, address, windowDaysFor(opts)));
    return raw ? (JSON.parse(raw) as RpcFixtures) : null;
  } catch (err) {
    opts.logger?.warn({ err: err instanceof Error ? err.message : String(err) }, 'rpc-fixtures: cache read failed');
    return null;
  }
}

async function headAndRate(
  rpcCall: RpcCall,
  rpcUrl: string,
  timeoutMs: number,
  nowMs: number,
  blockSecondsEstimate: number,
): Promise<{ number: number; hash: string; timestamp: number; ageSeconds: number; blockSeconds: number }> {
  const head = await rpcCall(rpcUrl, 'eth_getBlockByNumber', ['latest', false], timeoutMs);
  const h = head as { number?: string; hash?: string; timestamp?: string } | null;
  const derived = deriveNodeHead(h ? { number: h.number ?? '', timestamp: h.timestamp ?? '' } : null, nowMs);
  let blockSeconds = blockSecondsEstimate;
  try {
    const sampleNum = Math.max(1, derived.headNumber - BLOCK_TIME_SAMPLE_SPAN);
    const old = (await rpcCall(rpcUrl, 'eth_getBlockByNumber', ['0x' + sampleNum.toString(16), false], timeoutMs)) as {
      timestamp?: string;
    } | null;
    if (old?.timestamp) {
      const measured = (derived.headTimestamp - parseInt(old.timestamp, 16)) / (derived.headNumber - sampleNum);
      if (Number.isFinite(measured) && measured > 0) blockSeconds = measured;
    }
  } catch {
    // keep the estimate
  }
  return {
    number: derived.headNumber,
    hash: h?.hash ?? '',
    timestamp: derived.headTimestamp,
    ageSeconds: derived.ageSeconds,
    blockSeconds,
  };
}

async function balanceOf(rpcCall: RpcCall, rpcUrl: string, token: string, owner: string, timeoutMs: number): Promise<string> {
  const data = BALANCE_OF_SELECTOR + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const res = await rpcCall(rpcUrl, 'eth_call', [{ to: token, data }, 'latest'], timeoutMs);
  return typeof res === 'string' && res !== '0x' ? res : '0x0';
}

async function fetchFromRpc(
  chain: RiskChainId,
  address: string,
  rpc: RiskChainRpc,
  opts: RpcFetchOptions,
  rpcCall: RpcCall,
  nowMs: number,
): Promise<RpcFixtures> {
  const cfg = RISK_CHAINS[chain];
  const t = opts.fetchTimeoutMs;
  const log = opts.logger;
  const maxLag = opts.maxHeadLagSec ?? getMaxHeadLagSec();

  const head = await headAndRate(rpcCall, rpc.url, t, nowMs, cfg.blockSecondsEstimate);
  if (head.ageSeconds > maxLag) {
    throw new Error(`rpc-fixtures: ${rpc.url} head is ${head.ageSeconds}s old (> ${maxLag}s)`);
  }

  // Transfers: explorer API when keyed, else the bounded RPC log window.
  const windowDays = windowDaysFor(opts);
  const toBlock = head.number - HEAD_SAFETY_LAG;
  const windowBlocks = Math.round((windowDays * 86_400) / head.blockSeconds);
  const fromBlock = Math.max(0, toBlock - windowBlocks + 1);

  let transfers: { items: NodeTransfer[]; truncated: boolean; source: 'explorer_api' | 'rpc_logs' };
  let window: ScanWindow;
  const apiKey = opts.explorerApiKey === undefined ? riskChainExplorerApiKey(chain) : opts.explorerApiKey ?? undefined;
  let explorerOk = false;
  if (apiKey) {
    try {
      transfers = {
        ...(await fetchExplorerTransfers(chain, address, apiKey, t, opts.fetchImpl ?? fetch, nowMs)),
        source: 'explorer_api',
      };
      explorerOk = true;
      // Page cap hit → the oldest row we hold bounds the window we can vouch for.
      const oldest = transfers.items[transfers.items.length - 1]?.timestamp;
      const coveredDays =
        transfers.truncated && oldest
          ? Math.max(0, (nowMs - new Date(oldest).getTime()) / 86_400_000)
          : ACTIVITY_WINDOW_DAYS;
      window = {
        days: Math.min(ACTIVITY_WINDOW_DAYS, coveredDays),
        requested_days: ACTIVITY_WINDOW_DAYS,
        from_block: fromBlock,
        to_block: toBlock,
        block_seconds: head.blockSeconds,
        source: 'explorer_api',
        truncated: transfers.truncated,
        scanned_from_block: fromBlock,
        rpc_url: rpc.url,
      };
    } catch (err) {
      log?.warn({ err: err instanceof Error ? err.message : String(err) }, 'rpc-fixtures: explorer api failed; using RPC logs');
    }
  }
  if (!explorerOk) {
    const scan = await scanTransferLogs({
      address,
      rpcUrl: rpc.url,
      fromBlock,
      toBlock,
      chunkBlocks: rpc.logChunkBlocks,
      timeoutMs: t,
      rpcCall,
      concurrency: opts.concurrency ?? defaultRpcScanConcurrency(),
      budgetMs: opts.scanBudgetMs ?? defaultRpcScanBudgetMs(),
      maxLogs: (opts.maxTransfers ?? DEFAULT_MAX_TRANSFERS) * 3,
      now: opts.now,
      logger: log,
    });
    const mapped = mapLogsToTransfers(
      scan.logs,
      head.number,
      head.timestamp,
      opts.maxTransfers ?? DEFAULT_MAX_TRANSFERS,
      head.blockSeconds,
    );
    transfers = { items: mapped.items, truncated: scan.truncated || mapped.truncated, source: 'rpc_logs' };
    // What was actually covered: the scanned block span at the measured block rate.
    const scannedDays = ((toBlock - scan.scannedFromBlock + 1) * head.blockSeconds) / 86_400;
    window = {
      days: scan.truncated ? Math.min(windowDays, Math.max(0, scannedDays)) : windowDays,
      requested_days: windowDays,
      from_block: fromBlock,
      to_block: toBlock,
      block_seconds: head.blockSeconds,
      source: 'rpc_logs',
      truncated: transfers.truncated,
      scanned_from_block: scan.scannedFromBlock,
      rpc_url: rpc.url,
    };
  }

  // State reads — all `latest` on the same RPC so they agree with the head above.
  // A failed read is recorded, never passed off as zero: the checks that read it are not assessed.
  const stateUnavailable: string[] = [];
  const stateRead = <T>(name: string, p: Promise<T>, fallback: T) =>
    p.catch(() => {
      stateUnavailable.push(name);
      return fallback;
    });
  const [code, nonce, native, ...stables] = await Promise.all([
    stateRead('code', rpcCall(rpc.url, 'eth_getCode', [address, 'latest'], t), '0x'),
    stateRead('nonce', rpcCall(rpc.url, 'eth_getTransactionCount', [address, 'latest'], t), '0x0'),
    stateRead('eth_balance', rpcCall(rpc.url, 'eth_getBalance', [address, 'latest'], t), '0x0'),
    ...cfg.stablecoins.map((s) =>
      stateRead(s.symbol === 'USDC' ? 'usdc_balance' : `${s.symbol.toLowerCase()}_balance`, balanceOf(rpcCall, rpc.url, s.address, address, t), '0x0'),
    ),
  ]);
  const stablecoin_balances: Record<string, string> = {};
  cfg.stablecoins.forEach((s, i) => {
    stablecoin_balances[s.symbol] = stables[i] as string;
  });

  // Token count: distinct tokens that paid INTO the wallet in the window, with a
  // balance now. Capped so a spam-airdropped wallet can't turn this into 500 calls.
  const lower = address.toLowerCase();
  const inboundTokens = [...new Set(transfers!.items.filter((x) => x.to.hash === lower).map((x) => x.token.address))];
  const toCheck = inboundTokens.slice(0, TOKEN_BALANCE_CHECK_CAP);
  const balances = await Promise.all(toCheck.map((tok) => balanceOf(rpcCall, rpc.url, tok, address, t).catch(() => '0x0')));
  const token_count = balances.filter((b) => {
    try {
      return BigInt(b) > 0n;
    } catch {
      return false;
    }
  }).length;

  return {
    chain,
    acp_details: { data: null },
    blockscout_counters: {
      transactions_count: String(parseInt(String(nonce), 16) || 0),
      token_transfers_count: String(transfers!.items.length),
    },
    blockscout_transfers: transfers!,
    sentinel_code: { result: typeof code === 'string' ? code : '0x' },
    sentinel_nonce: { result: typeof nonce === 'string' ? nonce : '0x0' },
    sentinel_eth_balance: { result: typeof native === 'string' ? native : '0x0' },
    sentinel_usdc_balance: { result: stablecoin_balances.USDC ?? '0x0' },
    geckoterminal: null,
    sentinel_block: { number: '0x' + head.number.toString(16), hash: head.hash },
    ...(stateUnavailable.length ? { state_unavailable: stateUnavailable as RpcFixtures['state_unavailable'] } : {}),
    data_source: {
      rpc_role: 'public',
      head_number: head.number,
      head_age_seconds: head.ageSeconds,
      head_stale: false,
    },
    window: window!,
    stablecoin_balances,
    token_count,
    token_count_lower_bound: inboundTokens.length > toCheck.length,
    fetched_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Fetch risk-check fixtures for `address` on a public-RPC chain. Tries each RPC
 * in order (env primary, then fallbacks), skipping any whose head is stale or
 * that cannot serve the newest log chunk. Cached per (chain, address) when a
 * cache is supplied so the API's history gate / teaser and the worker's decode
 * seconds later share one scan.
 */
export async function fetchRpcFixtures(
  chain: RiskChainId,
  address: string,
  opts: RpcFetchOptions,
): Promise<RpcFixtures> {
  const cached = await readCached(chain, address, opts);
  if (cached) return cached;

  const rpcCall: RpcCall = opts.rpcCall ?? ((url, method, params, timeoutMs) => jsonRpcResult(url, method, params, timeoutMs));
  const rpcs = opts.rpcs ?? riskChainRpcs(chain);
  const nowMs = (opts.now ?? Date.now)();
  let lastErr: unknown = null;

  for (const rpc of rpcs) {
    try {
      const fixtures = await fetchFromRpc(chain, address, rpc, opts, rpcCall, nowMs);
      if (opts.cache) {
        try {
          await opts.cache.set(
            cacheKey(chain, address, windowDaysFor(opts)),
            JSON.stringify(fixtures),
            opts.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC,
          );
        } catch (err) {
          opts.logger?.warn({ err: err instanceof Error ? err.message : String(err) }, 'rpc-fixtures: cache write failed');
        }
      }
      return fixtures;
    } catch (err) {
      lastErr = err;
      opts.logger?.warn(
        { err: err instanceof Error ? err.message : String(err), rpc: rpc.url },
        'rpc-fixtures: rpc failed; trying next',
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`rpc-fixtures: all ${chain} RPCs failed`);
}

/** Does the snapshot show ANY on-chain footprint? The history gate for public-RPC chains. */
export function rpcFixturesHaveHistory(fx: RpcFixtures): boolean {
  const hex = (v: string | undefined) => {
    try {
      return BigInt(v ?? '0x0');
    } catch {
      return 0n;
    }
  };
  if (hex(fx.sentinel_nonce.result) > 0n) return true;
  if (hex(fx.sentinel_eth_balance.result) > 0n) return true;
  if (fx.blockscout_transfers.items.length > 0) return true;
  if (fx.sentinel_code.result && fx.sentinel_code.result !== '0x') return true;
  return Object.values(fx.stablecoin_balances).some((b) => hex(b) > 0n);
}
