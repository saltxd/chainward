import { Worker, Queue, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { RISK_CHAINS, riskChainRpcs, type RiskChainRpc } from '@chainward/common';
import {
  BOARD_MAX_ROWS,
  BSC_IDENTITY_REGISTRY,
  HIRE_CONTRACTS,
  HIRE_TOPICS,
  HIRE_WINDOW_DAYS,
  MIN_DISTINCT_HIRERS,
  REGISTRY_TOPICS,
  SELLER_BLOCKS_PER_DAY,
  SET_AND_EARN_END,
  SET_AND_EARN_START_BLOCK,
  applyHireLogs,
  applyRegistryLogs,
  assembleSetAndEarnBoard,
  assessHirers,
  boardOrder,
  bscFundingGraph,
  groupHirers,
  hireKey,
  hiresByAgent,
  jobKey,
  jsonRpcResult,
  mapLimit,
  scanHireLogs,
  sellerDemandRpcUrl,
  summarizeHirers,
  withRpcFallback,
  type AgentHireStats,
  type AgentRegistration,
  type AgentVerdict,
  type BoardHire,
  type FirstFunder,
  type FundingGraph,
  type HireSummary,
  type LogWithData,
  type RpcCall,
  type SetAndEarnBoard,
  type SetAndEarnBoardRow,
} from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── Set and Earn board ───────────────────────────────────────────────────────
//
// Daily: every ERC-8004 agent registered on BSC mainnet since Set and Earn
// opened (Oct 1 2026) that has been hired, with the paid hire check's verdict
// for those with 3+ distinct hirers. Stored in Redis for GET
// /api/set-and-earn/board and chainward.ai/set-and-earn. Needs the Alchemy BNB
// URL the hire check uses (sellerDemandRpcUrl); off without it.
//
// Incremental: registry and marketplace logs are scanned from Redis cursors on
// the public BSC RPCs (10,000-block getLogs chunks, 200,000-block segments
// persisted as they finish), and registrations, hires and completions are kept
// in Redis, so a daily run reads ~192,000 new blocks: ~20 getLogs per filter,
// 2 filters, ~40 public calls. A first run over the whole campaign (36 days,
// ~6.9M blocks) is ~1,400 getLogs, a few minutes at concurrency 4.
//
// Traces: per agent, up to 20 hirers plus the owner and agent wallet, 2 kinds
// x up to 4 hops, each hop one alchemy_getAssetTransfers (first funder) and at
// most one more (hub inflow count). Results are cached in Redis for 30 days
// (set-and-earn:funder:<address>), so an unchanged agent re-checks for ~0
// Alchemy calls and a new hirer costs at most ~16. Alchemy lookups are paced
// (SET_AND_EARN_ALCHEMY_RPS, default 2/s, leaving room under the free tier's
// ~3 calls/s for paid checks) and capped per run (SET_AND_EARN_TRACE_BUDGET,
// default 3,000, ~25 minutes, checked before each agent starts); agents past
// the cap keep their previous verdict or show as pending.
//
// After the campaign closes (Nov 5 23:59:59 UTC) new registrations are no
// longer added; hires and completions of campaign agents keep counting.

const QUEUE = 'set-and-earn-board';
export const SET_AND_EARN_KEYS = {
  latest: 'set-and-earn:board:latest',
  registryCursor: 'set-and-earn:cursor:registry',
  hiresCursor: 'set-and-earn:cursor:hires',
  /** Hash: agent id → AgentRegistration JSON. */
  registrations: 'set-and-earn:registrations',
  /** Hash: `${tx}:${logIndex}` → BoardHire JSON. */
  hires: 'set-and-earn:hires',
  /** Set of jobKey(contract, order/job id) for completed hires. */
  completions: 'set-and-earn:completions',
} as const;
const datedKey = (iso: string) => `set-and-earn:board:${iso.slice(0, 10)}`;
const funderKey = (address: string) => `set-and-earn:funder:${address}`;

const HISTORY_TTL_SEC = 90 * 86_400;
const FUNDER_TTL_SEC = 30 * 86_400;
/** Stay a few blocks under the head: the public RPC pool can lag. */
const HEAD_LAG = 5;
const SEGMENT_BLOCKS = 200_000;
const LOG_CONCURRENCY = 4;
const HEADER_CONCURRENCY = 4;
const TRACE_CONCURRENCY = 3;
const AGENT_PAUSE_MS = 1_000;
const RETRY_PAUSE_MS = 20_000;
const HSET_BATCH = 500;
const RPC_TIMEOUT_MS = 15_000;
const BSC_BLOCK_MS = RISK_CHAINS.bsc.blockSecondsEstimate * 1000;
/** Each run re-reads this many blocks below its cursors (~15 min): a pool node behind the head can return a range short without an error. */
const RESCAN_BLOCKS = 2_000;
/** Last block at or before the campaign's end, found once the head passes it. */
const END_BLOCK_KEY = 'set-and-earn:end-block';
const END_MS = Date.parse(SET_AND_EARN_END);

/** A non-negative number from an env value, or the fallback. */
export function envNumber(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

interface BoardLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface SetAndEarnBoardDeps {
  redis: Redis;
  /** Alchemy BNB URL for the funding traces (alchemy_getAssetTransfers). */
  alchemyUrl: string;
  /** Public BSC RPCs for logs, headers, code and nonces; defaults to the chain registry's list. */
  rpcs?: RiskChainRpc[];
  rpcCall?: RpcCall;
  /** Injected funding graph (tests); defaults to the hire check's bscFundingGraph. Cached and paced either way. */
  graph?: FundingGraph;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Uncached Alchemy lookups (first funder, hub check) per run before tracing stops. */
  traceBudget?: number;
  alchemyCallsPerSec?: number;
  log?: BoardLog;
}

export interface SetAndEarnRunStats {
  head: number;
  as_of_block: number;
  rpc_calls: Record<string, number>;
  alchemy_lookups: number;
  funding_cache_hits: number;
  agents_traced: number;
  ms: number;
}

const defaultRpcCall: RpcCall = (url, method, params, timeoutMs) => jsonRpcResult(url, method, params, timeoutMs);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hex = (n: number) => '0x' + n.toString(16);
const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Spaces calls `1/perSec` seconds apart (0 = unpaced). */
function pacer(perSec: number, sleep: (ms: number) => Promise<void>) {
  if (!(perSec > 0)) return <T>(fn: () => Promise<T>) => fn();
  const gap = 1000 / perSec;
  let next = 0;
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gap;
    if (at > now) await sleep(at - now);
    return fn();
  };
}

interface TraceCounters {
  alchemy_lookups: number;
  funding_cache_hits: number;
}

/**
 * The funding graph behind a Redis cache (30 days per address) and an in-run
 * memo. First funders are stored as {from, block} (the same-hub rule compares
 * blocks); "no funder yet" is not cached, since a later transfer would change it.
 */
function cachedGraph(
  base: FundingGraph,
  redis: Redis,
  pace: <T>(fn: () => Promise<T>) => Promise<T>,
  counters: TraceCounters,
): FundingGraph {
  const inflight = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      inflight.set(key, p);
      // A failed lookup is retried on the agent's second attempt, not replayed.
      p.catch(() => inflight.delete(key));
    }
    return p;
  };
  const lookup = async <T>(
    address: string,
    field: string,
    codec: { read: (raw: string) => T; write: (v: T) => string | null },
    compute: () => Promise<T>,
    alchemy: boolean,
  ): Promise<T> => {
    const key = funderKey(address);
    const raw = await redis.hget(key, field);
    if (raw !== null) {
      counters.funding_cache_hits += 1;
      return codec.read(raw);
    }
    if (alchemy) counters.alchemy_lookups += 1;
    const value = alchemy ? await pace(compute) : await compute();
    const stored = codec.write(value);
    if (stored !== null) {
      await redis.hset(key, field, stored);
      // 30 days from the address's first lookup; later fields don't extend it, so hub and contract flags age out too.
      if ((await redis.ttl(key)) < 0) await redis.expire(key, FUNDER_TTL_SEC);
    }
    return value;
  };
  const flag = { read: (r: string) => r === '1', write: (v: boolean) => (v ? '1' : '0') };
  const funder = {
    read: (r: string) => JSON.parse(r) as FirstFunder,
    write: (v: FirstFunder | null) => (v ? JSON.stringify({ from: v.from, block: v.block }) : null),
  };
  return {
    firstFunder: (kind, address) => {
      const a = address.toLowerCase();
      return once(`f:${kind}:${a}`, () => lookup(a, kind, funder, () => base.firstFunder(kind, a), true));
    },
    isHub: (address) => {
      const a = address.toLowerCase();
      return once(`h:${a}`, () => lookup(a, 'hub', flag, () => base.isHub(a), true));
    },
    isContract: (address) => {
      const a = address.toLowerCase();
      return once(`c:${a}`, () => lookup(a, 'contract', flag, () => base.isContract(a), false));
    },
  };
}

async function hsetMany(redis: Redis, key: string, entries: Array<[string, string]>): Promise<void> {
  for (let i = 0; i < entries.length; i += HSET_BATCH) {
    await redis.hset(key, Object.fromEntries(entries.slice(i, i + HSET_BATCH)));
  }
}

async function readCursor(redis: Redis, key: string): Promise<number> {
  const raw = await redis.get(key);
  return raw === null ? SET_AND_EARN_START_BLOCK - 1 : Number(raw);
}

/** The previous board's rows by agent id; empty when there is none or it doesn't parse. */
function previousRows(raw: string | null): Map<number, SetAndEarnBoardRow> {
  try {
    const rows = raw ? (JSON.parse(raw) as Partial<SetAndEarnBoard>).rows : undefined;
    return new Map(Array.isArray(rows) ? rows.map((r) => [r.agent_id, r]) : []);
  } catch {
    return new Map();
  }
}

/** A carried-over verdict from the previous board, or the given status when there is none. */
function previousVerdict(row: SetAndEarnBoardRow | undefined, status: 'error' | 'pending'): AgentVerdict {
  if (row?.verdict_status !== 'checked') return { status, summary: null, checked_at: null };
  const summary: HireSummary = {
    owner_linked: row.owner_linked ?? 0,
    inconclusive: row.inconclusive ?? 0,
    independent_within_limits: row.independent_within_limits ?? 0,
    passes_three_independent: row.passes_three_independent === true,
  };
  return { status: 'checked', summary, checked_at: row.checked_at };
}

export async function runSetAndEarnBoard(deps: SetAndEarnBoardDeps): Promise<{ board: SetAndEarnBoard; stats: SetAndEarnRunStats }> {
  const started = Date.now();
  const { redis } = deps;
  const log: BoardLog = deps.log ?? logger;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const rpcs = deps.rpcs ?? riskChainRpcs('bsc');
  const rpcUrl = rpcs[0]!.url;
  const rpcCounts: Record<string, number> = {};
  const baseCall = deps.rpcCall ?? defaultRpcCall;
  const logCall: RpcCall = (url, method, params, t) => {
    rpcCounts[method] = (rpcCounts[method] ?? 0) + 1;
    return baseCall(url, method, params, t);
  };
  const pointCall = withRpcFallback(logCall, rpcs);

  const blockTimes = new Map<number, Promise<string>>();
  const blockTime = (block: number): Promise<string> => {
    let p = blockTimes.get(block);
    if (!p) {
      p = (async () => {
        const b = (await pointCall(rpcUrl, 'eth_getBlockByNumber', [hex(block), false], RPC_TIMEOUT_MS)) as { timestamp: string } | null;
        if (!b) throw new Error(`eth_getBlockByNumber: block ${block} not found`);
        return new Date(Number(BigInt(b.timestamp)) * 1000).toISOString();
      })();
      blockTimes.set(block, p);
      p.catch(() => blockTimes.delete(block));
    }
    return p;
  };

  const head = Number(BigInt(String(await pointCall(rpcUrl, 'eth_blockNumber', [], RPC_TIMEOUT_MS)))) - HEAD_LAG;

  /** The campaign's last block, once the head is past it (binary search over headers, ~23 reads, then cached); else null. */
  const campaignEndBlock = async (): Promise<number | null> => {
    const cached = await redis.get(END_BLOCK_KEY);
    if (cached !== null) return Number(cached);
    if (Date.parse(await blockTime(head)) <= END_MS) return null;
    let lo = SET_AND_EARN_START_BLOCK; // at or before the end
    let hi = head; // after it
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (Date.parse(await blockTime(mid)) <= END_MS) lo = mid;
      else hi = mid;
    }
    await redis.set(END_BLOCK_KEY, String(lo));
    return lo;
  };
  const endBlock = await campaignEndBlock();

  /** Scans [cursor + 1 - RESCAN_BLOCKS, to] in segments, advancing the cursor (never backwards) after each. */
  const scanForward = async (
    cursorKey: string,
    to: number,
    filter: { address: string[]; topics: Array<string | string[] | null> },
    onSegment: (logs: LogWithData[]) => Promise<void>,
  ): Promise<void> => {
    const cursor = await readCursor(redis, cursorKey);
    const from = Math.max(SET_AND_EARN_START_BLOCK, cursor + 1 - RESCAN_BLOCKS);
    for (let start = from; start <= to; start += SEGMENT_BLOCKS) {
      const end = Math.min(to, start + SEGMENT_BLOCKS - 1);
      let logs: LogWithData[];
      try {
        logs = (await scanHireLogs({ rpcs, rpcCall: logCall, ...filter, fromBlock: start, toBlock: end, concurrency: LOG_CONCURRENCY })) as LogWithData[];
      } catch (err) {
        // Keep what was read; the next run resumes from the cursor.
        log.warn({ err: errMessage(err), start, end }, 'setAndEarnBoard: log scan stopped');
        return;
      }
      await onSegment(logs);
      if (end > cursor) await redis.set(cursorKey, String(end));
    }
  };

  // Registrations (none added after the campaign's end), and owner / URI / wallet changes, to the head.
  const regs = new Map<number, AgentRegistration>(
    Object.entries(await redis.hgetall(SET_AND_EARN_KEYS.registrations)).map(([id, json]) => [Number(id), JSON.parse(json) as AgentRegistration]),
  );
  await scanForward(
    SET_AND_EARN_KEYS.registryCursor,
    head,
    { address: [BSC_IDENTITY_REGISTRY], topics: [REGISTRY_TOPICS] },
    async (logs) => {
      const changed = applyRegistryLogs(regs, logs, { lastBlock: endBlock ?? undefined });
      await hsetMany(redis, SET_AND_EARN_KEYS.registrations, [...changed].map((id) => [String(id), JSON.stringify(regs.get(id))]));
    },
  );
  const registryCursor = await readCursor(redis, SET_AND_EARN_KEYS.registryCursor);

  // Hires and completions, never past the registry: a TermiX order is kept only for an agent already seen registering.
  const hires = new Map<string, BoardHire>(
    Object.entries(await redis.hgetall(SET_AND_EARN_KEYS.hires)).map(([k, json]) => [k, JSON.parse(json) as BoardHire]),
  );
  const completions = new Set(await redis.smembers(SET_AND_EARN_KEYS.completions));
  const knownJobs = new Set([...hires.values()].map((h) => jobKey(h.contract, h.job)));
  await scanForward(
    SET_AND_EARN_KEYS.hiresCursor,
    registryCursor,
    { address: HIRE_CONTRACTS, topics: [HIRE_TOPICS] },
    async (logs) => {
      const found = applyHireLogs({ logs, isCampaignAgent: (id) => regs.has(id), knownJobs });
      for (const h of found.hires) {
        hires.set(hireKey(h), h);
        knownJobs.add(jobKey(h.contract, h.job));
      }
      for (const c of found.completions) completions.add(c);
      await hsetMany(redis, SET_AND_EARN_KEYS.hires, found.hires.map((h) => [hireKey(h), JSON.stringify(h)]));
      if (found.completions.length) await redis.sadd(SET_AND_EARN_KEYS.completions, ...found.completions);
    },
  );
  const asOfBlock = await readCursor(redis, SET_AND_EARN_KEYS.hiresCursor);
  if (asOfBlock < SET_AND_EARN_START_BLOCK) throw new Error('setAndEarnBoard: no blocks scanned yet');
  const asOf = { block: asOfBlock, time: await blockTime(asOfBlock) };

  // The registry can be read further than the hires (a failed segment); the board stops at as_of, and at the campaign's end.
  const lastListed = Math.min(asOfBlock, endBlock ?? Infinity);
  const listed = new Map([...regs].filter(([, r]) => r.registered_block <= lastListed));
  const ordered = boardOrder(hiresByAgent(listed, [...hires.values()], completions));

  // Registration times for agents that make the board, once each.
  const undated = ordered
    .slice(0, BOARD_MAX_ROWS)
    .map((s) => regs.get(s.agent_id)!)
    .filter((r) => !r.registered_at);
  const dated = await mapLimit(undated, HEADER_CONCURRENCY, async (r) => {
    try {
      r.registered_at = await blockTime(r.registered_block);
      return r;
    } catch {
      return null;
    }
  });
  await hsetMany(
    redis,
    SET_AND_EARN_KEYS.registrations,
    dated.filter((r): r is AgentRegistration => r !== null).map((r) => [String(r.agent_id), JSON.stringify(r)]),
  );

  // Verdicts, in board order, within the lookup budget.
  const counters: TraceCounters = { alchemy_lookups: 0, funding_cache_hits: 0 };
  const baseGraph =
    deps.graph ??
    bscFundingGraph({
      alchemyUrl: deps.alchemyUrl,
      rpcUrl,
      rpcCall: pointCall,
      windowFromBlock: asOfBlock - HIRE_WINDOW_DAYS * SELLER_BLOCKS_PER_DAY.bsc,
      log: { warn: (msg) => log.warn({}, msg) },
    });
  const rps = deps.alchemyCallsPerSec ?? envNumber(process.env.SET_AND_EARN_ALCHEMY_RPS, 2);
  const graph = cachedGraph(baseGraph, redis, pacer(rps, sleep), counters);
  const budget = deps.traceBudget ?? envNumber(process.env.SET_AND_EARN_TRACE_BUDGET, 3000);
  const previous = previousRows(await redis.get(SET_AND_EARN_KEYS.latest));

  const check = async (s: AgentHireStats): Promise<HireSummary> => {
    const reg = regs.get(s.agent_id)!;
    const hirers = groupHirers(s.hires).map((h) => ({
      address: h.address,
      hires: h.hires,
      // Not shown on the board (it reports counts only): estimated from the block, saving a header read per hirer.
      first_hire_at: new Date(Date.parse(asOf.time) - (asOf.block - h.first_block) * BSC_BLOCK_MS).toISOString(),
    }));
    const assessments = await assessHirers({ owner: reg.owner, agentWallets: reg.agent_wallet ? [reg.agent_wallet] : [], hirers, graph });
    return summarizeHirers(assessments);
  };

  const verdicts = new Map<number, AgentVerdict>();
  let traced = 0;
  const toTrace = ordered.filter((s) => s.distinct_hirers >= MIN_DISTINCT_HIRERS);
  await mapLimit(toTrace, TRACE_CONCURRENCY, async (s) => {
    if (counters.alchemy_lookups >= budget) {
      verdicts.set(s.agent_id, previousVerdict(previous.get(s.agent_id), 'pending'));
      return;
    }
    traced += 1;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        verdicts.set(s.agent_id, { status: 'checked', summary: await check(s), checked_at: now().toISOString() });
        break;
      } catch (err) {
        log.warn({ agent: s.agent_id, attempt, err: errMessage(err) }, 'setAndEarnBoard: hire check failed');
        if (attempt === 1) await sleep(RETRY_PAUSE_MS); // let the compute-unit budget refill
        else verdicts.set(s.agent_id, previousVerdict(previous.get(s.agent_id), 'error'));
      }
    }
    await sleep(AGENT_PAUSE_MS);
  });

  const board = assembleSetAndEarnBoard({
    registrations: listed,
    hires: [...hires.values()],
    completions,
    verdicts,
    asOf,
    generatedAt: now().toISOString(),
  });
  const json = JSON.stringify(board);
  await redis.set(SET_AND_EARN_KEYS.latest, json);
  await redis.set(datedKey(board.generated_at), json, 'EX', HISTORY_TTL_SEC);

  return {
    board,
    stats: {
      head,
      as_of_block: asOfBlock,
      rpc_calls: rpcCounts,
      alchemy_lookups: counters.alchemy_lookups,
      funding_cache_hits: counters.funding_cache_hits,
      agents_traced: traced,
      ms: Date.now() - started,
    },
  };
}

export async function buildSetAndEarnBoard(): Promise<Record<string, unknown>> {
  const alchemyUrl = sellerDemandRpcUrl('bsc', process.env);
  if (!alchemyUrl) {
    logger.warn('setAndEarnBoard: no Alchemy BNB URL for the funding traces; skipped');
    return { skipped: 'no_rpc' };
  }
  const { board, stats } = await runSetAndEarnBoard({ redis: getRedis(), alchemyUrl, log: logger });
  logger.info({ ...stats, rows: board.rows.length, totals: board.totals }, 'setAndEarnBoard: board built');
  return { rows: board.rows.length, ...stats };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createSetAndEarnBoardWorker() {
  return new Worker(QUEUE, async (_job: Job) => buildSetAndEarnBoard(), {
    connection: getRedis(),
    concurrency: 1,
  });
}

export async function setupSetAndEarnBoardSchedule(redis: Redis) {
  const queue = new Queue(QUEUE, { connection: redis });
  for (const job of await queue.getRepeatableJobs()) {
    await queue.removeRepeatableByKey(job.key);
  }
  await queue.add('set-and-earn-board-daily', {}, { repeat: { pattern: '0 6 * * *', tz: 'UTC' }, jobId: 'set-and-earn-board-daily' });
  if (!(await redis.exists(SET_AND_EARN_KEYS.latest))) {
    await queue.add('set-and-earn-board-initial', {}, { jobId: `set-and-earn-board-initial-${Date.now()}` });
  }
  logger.info('Set and Earn board schedule configured (daily 06:00 UTC)');
  await queue.close();
}
