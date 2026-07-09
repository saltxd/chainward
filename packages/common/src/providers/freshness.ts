/**
 * Node head-freshness guard.
 *
 * A self-hosted Base node can keep ANSWERING RPC calls while its head is frozen
 * hours/days behind tip (the recurring op-reth EL-sync wedge). Because it responds
 * successfully, the normal error-triggered fallback (viem `fallback()`, Blockscout)
 * never fires — so reports get silently built on a stale chain view. That is the
 * worst failure for a product whose brand is "evidence, always".
 *
 * This module makes staleness observable + actionable: probe the head once with a
 * cheap `eth_getBlockByNumber("latest", false)` call (short in-process cache so hot
 * paths never hammer it), and let callers refuse to source a NEW report/decode from
 * a node whose head age exceeds `NODE_MAX_HEAD_LAG_SEC`.
 *
 * The pure pieces (`deriveNodeHead`, `isNodeHeadFresh`, `getMaxHeadLagSec`) carry the
 * decision logic and are unit-tested without any network; `fetchNodeHead` /
 * `assessNodeFreshness` add the single I/O probe + cache around them.
 */

/** Default max head lag before a node is UNFIT as a data source for new reports (seconds). */
export const DEFAULT_MAX_HEAD_LAG_SEC = 600;

/** In-process cache TTL for head probes so hot paths don't hammer the node. */
export const DEFAULT_HEAD_CACHE_TTL_MS = 20_000;

/** Timeout for the single eth_getBlockByNumber("latest") probe. */
export const DEFAULT_HEAD_PROBE_TIMEOUT_MS = 5_000;

export interface NodeHead {
  /** Latest block number the node reports at its head. */
  headNumber: number;
  /** Unix timestamp (seconds) of that head block. */
  headTimestamp: number;
  /** now - headTimestamp, in seconds (never negative). */
  ageSeconds: number;
}

export interface NodeFreshness extends NodeHead {
  /** Whether the head age is within the (configured) threshold. */
  fresh: boolean;
  /** The threshold used for the decision, in seconds. */
  maxLagSec: number;
}

/** Raw eth_getBlockByNumber("latest", false) header fields this module needs. */
export interface RawBlockHead {
  number: string; // hex
  timestamp: string; // hex
}

/** Minimal env shape — avoids a hard dependency on Node type definitions in this package. */
export type EnvLike = Record<string, string | undefined>;

function readProcessEnv(): EnvLike {
  return (globalThis as { process?: { env?: EnvLike } }).process?.env ?? {};
}

/**
 * Reads NODE_MAX_HEAD_LAG_SEC (default 600). A node whose head age exceeds this is
 * UNFIT as a data source for NEW reports/decodes. Invalid / non-positive values fall
 * back to the default rather than silently disabling the guard.
 */
export function getMaxHeadLagSec(env: EnvLike = readProcessEnv()): number {
  const raw = env.NODE_MAX_HEAD_LAG_SEC;
  if (raw == null || raw === '') return DEFAULT_MAX_HEAD_LAG_SEC;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_HEAD_LAG_SEC;
}

/**
 * Pure: derive a {@link NodeHead} from a raw block header + wall-clock (ms epoch).
 * Throws on an unparseable/absent number or timestamp so a garbage response can never
 * masquerade as a fresh head.
 */
export function deriveNodeHead(block: RawBlockHead | null | undefined, nowMs: number): NodeHead {
  if (!block?.number || !block?.timestamp) {
    throw new Error('freshness: missing head block number/timestamp');
  }
  const headNumber = parseInt(block.number, 16);
  const headTimestamp = parseInt(block.timestamp, 16);
  if (!Number.isFinite(headNumber) || !Number.isFinite(headTimestamp)) {
    throw new Error('freshness: unparseable head block number/timestamp');
  }
  const ageSeconds = Math.max(0, Math.floor(nowMs / 1000) - headTimestamp);
  return { headNumber, headTimestamp, ageSeconds };
}

/** Pure: is this head fresh enough to source a new report? */
export function isNodeHeadFresh(head: NodeHead, maxLagSec: number = getMaxHeadLagSec()): boolean {
  return head.ageSeconds <= maxLagSec;
}

export interface FetchNodeHeadOptions {
  /** Probe timeout (ms). Default {@link DEFAULT_HEAD_PROBE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** In-process cache TTL (ms). Default {@link DEFAULT_HEAD_CACHE_TTL_MS}. `0` disables caching. */
  cacheTtlMs?: number;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock returning ms epoch (tests). Defaults to Date.now. */
  now?: () => number;
}

interface CacheEntry {
  headNumber: number;
  headTimestamp: number;
  expiresAt: number;
}

const headCache = new Map<string, CacheEntry>();

/**
 * Probes `rpcUrl` for its latest block head and returns a {@link NodeHead}. One
 * `eth_getBlockByNumber("latest", false)` call, memoized per-URL for `cacheTtlMs`.
 * On a cache hit the age is recomputed against the current clock (staleness only ever
 * worsens between probes, so a cached head must not read fresher than it is).
 */
export async function fetchNodeHead(rpcUrl: string, opts: FetchNodeHeadOptions = {}): Promise<NodeHead> {
  const now = opts.now ?? Date.now;
  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_HEAD_CACHE_TTL_MS;
  const nowMs = now();

  const cached = headCache.get(rpcUrl);
  if (cached && cacheTtlMs > 0 && cached.expiresAt > nowMs) {
    return {
      headNumber: cached.headNumber,
      headTimestamp: cached.headTimestamp,
      ageSeconds: Math.max(0, Math.floor(nowMs / 1000) - cached.headTimestamp),
    };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const resp = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_HEAD_PROBE_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1,
    }),
  });
  if (!resp.ok) throw new Error(`freshness probe: HTTP ${resp.status}`);
  const body = (await resp.json()) as { result?: RawBlockHead; error?: { message?: string } };
  if (body?.error) throw new Error(`freshness probe: ${body.error.message ?? 'rpc error'}`);

  const head = deriveNodeHead(body?.result, nowMs);
  if (cacheTtlMs > 0) {
    headCache.set(rpcUrl, {
      headNumber: head.headNumber,
      headTimestamp: head.headTimestamp,
      expiresAt: nowMs + cacheTtlMs,
    });
  }
  return head;
}

/**
 * Probe `rpcUrl` and decide whether it is fresh enough to source a new report.
 * Combines {@link fetchNodeHead} with the {@link isNodeHeadFresh} decision so call
 * sites get one object to log + branch on. Propagates the probe error if the node is
 * unreachable — an unreachable node is handled by the caller's existing failure path.
 */
export async function assessNodeFreshness(
  rpcUrl: string,
  opts: FetchNodeHeadOptions & { maxLagSec?: number } = {},
): Promise<NodeFreshness> {
  const head = await fetchNodeHead(rpcUrl, opts);
  const maxLagSec = opts.maxLagSec ?? getMaxHeadLagSec();
  return { ...head, fresh: head.ageSeconds <= maxLagSec, maxLagSec };
}

/** Test-only: clear the in-process head cache between cases. */
export function _resetHeadCache(): void {
  headCache.clear();
}
