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
  agentsOwnedBy,
  alchemyAssetTransfers,
  applyHireLogs,
  applyRegistryLogs,
  assembleSetAndEarnBoard,
  assessHirers,
  boardOrder,
  bscFundingGraph,
  describeRegistryAgent,
  groupHirers,
  hireKey,
  hiresByAgent,
  jobKey,
  jsonRpcResult,
  mapLimit,
  readRegistryAgent,
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
// Daily: every ERC-8004 agent on BSC mainnet hired since Set and Earn opened
// (Oct 1 2026), whenever it was registered, marking those registered during
// the campaign, with the paid hire check's verdict for those with 3+ distinct
// hirers. Stored in Redis for GET /api/set-and-earn/board and
// chainward.ai/set-and-earn. Needs the Alchemy BNB URL the hire check uses
// (sellerDemandRpcUrl); off without it.
//
// Incremental: registry and marketplace logs are scanned from Redis cursors on
// the public BSC RPCs (10,000-block getLogs chunks, 200,000-block segments
// persisted as they finish), and registrations, hires and completions are kept
// in Redis, so a daily run reads ~192,000 new blocks: ~20 getLogs per filter,
// 2 filters, ~40 public calls. A first run over the whole campaign (36 days,
// ~6.9M blocks) is ~1,400 getLogs, a few minutes at concurrency 4. Every
// TermiX hire is kept (~2,000 a day in week one: ~75,000, tens of MB of Redis,
// by Nov 5). Agents the board shows or traces that weren't seen registering
// are read from the registry once (3 eth_calls each, ~1,500 on a first run);
// ERC-8183 providers are matched to the agents they own through Alchemy's
// transfer index, once a week each; an older agent's registration date comes
// from its mint (one Alchemy call per owner, at most 100 owners a run).
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
/** Registry reads are 3 eth_calls each; public RPCs answer 429 well before 8 at a time. */
const REGISTRY_CONCURRENCY = 3;
const READ_ATTEMPTS = 3;
const PROVIDER_TTL_SEC = 7 * 86_400;
const providerKey = (address: string) => `set-and-earn:provider:${address}`;
const MINT_LOOKUPS_PER_RUN = 100;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
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
  /** Agents an ERC-8183 provider owns (tests); defaults to the hire check's agentsOwnedBy. */
  agentsOwnedBy?: (owner: string, atBlock: number) => Promise<number[]>;
  /** Registry mints to an owner (tests); defaults to Alchemy's ERC-721 transfer index. */
  mintsTo?: (owner: string) => Promise<Array<{ agent_id: number; block: number }>>;
  /** Uncached Alchemy lookups (first funder, hub check, provider, mint) per run before tracing stops. */
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

/** Identity registry tokens minted to an owner, with their blocks (first 1,000). */
async function alchemyMintsTo(
  alchemyUrl: string,
  owner: string,
  log: { warn: (msg: string) => void },
): Promise<Array<{ agent_id: number; block: number }>> {
  const res = await alchemyAssetTransfers(
    alchemyUrl,
    {
      category: ['erc721'],
      contractAddresses: [BSC_IDENTITY_REGISTRY],
      fromAddress: ZERO_ADDRESS,
      toAddress: owner,
      fromBlock: '0x0',
      order: 'asc',
      maxCount: '0x3e8',
      withMetadata: false,
      excludeZeroValue: false,
    },
    log,
  );
  return res.transfers.flatMap((t) =>
    t.erc721TokenId && t.blockNum ? [{ agent_id: Number(BigInt(t.erc721TokenId)), block: Number(BigInt(t.blockNum)) }] : [],
  );
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

  /** A public-RPC read retried after 1 s, then 2 s: every endpoint in the list can be throttling at once. */
  const retrying = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= READ_ATTEMPTS) throw err;
        await sleep(1_000 * attempt);
      }
    }
  };

  const blockTimes = new Map<number, Promise<string>>();
  const blockTime = (block: number): Promise<string> => {
    let p = blockTimes.get(block);
    if (!p) {
      p = (async () => {
        const b = (await retrying(() => pointCall(rpcUrl, 'eth_getBlockByNumber', [hex(block), false], RPC_TIMEOUT_MS))) as {
          timestamp: string;
        } | null;
        if (!b) throw new Error(`eth_getBlockByNumber: block ${block} not found`);
        return new Date(Number(BigInt(b.timestamp)) * 1000).toISOString();
      })();
      blockTimes.set(block, p);
      p.catch(() => blockTimes.delete(block));
    }
    return p;
  };

  /** Fills registered_at from registered_block for these agents (header reads) and stores them. */
  const dateRegistrations = async (agents: AgentRegistration[]): Promise<void> => {
    const dated = await mapLimit(agents, HEADER_CONCURRENCY, async (r) => {
      try {
        r.registered_at = await blockTime(r.registered_block!);
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

  // Hires and completions of every agent, never past the registry scan.
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
      const found = applyHireLogs({ logs, knownJobs });
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
  const hireList = [...hires.values()];

  // Alchemy lookups (funding traces, ERC-8183 providers, older agents' mints) share one pace and one per-run cap.
  const counters: TraceCounters = { alchemy_lookups: 0, funding_cache_hits: 0 };
  const pace = pacer(deps.alchemyCallsPerSec ?? envNumber(process.env.SET_AND_EARN_ALCHEMY_RPS, 2), sleep);
  const budget = deps.traceBudget ?? envNumber(process.env.SET_AND_EARN_TRACE_BUDGET, 3000);
  const warnLog = { warn: (msg: string) => log.warn({}, msg) };
  const ownedBy = deps.agentsOwnedBy ?? ((owner: string, atBlock: number) => agentsOwnedBy(pointCall, rpcUrl, deps.alchemyUrl, owner, atBlock, warnLog));
  const mintsTo = deps.mintsTo ?? ((owner: string) => alchemyMintsTo(deps.alchemyUrl, owner, warnLog));

  // ERC-8183 providers: the agents each one owns (registry transfers to it in the last 60 days), looked up once a week.
  const providerAgents = new Map<string, number[]>();
  for (const provider of new Set(hireList.flatMap((h) => (h.provider ? [h.provider] : [])))) {
    const cached = await redis.get(providerKey(provider));
    if (cached !== null) {
      providerAgents.set(provider, JSON.parse(cached) as number[]);
      continue;
    }
    counters.alchemy_lookups += 1;
    try {
      const ids = await pace(() => ownedBy(provider, asOfBlock));
      providerAgents.set(provider, ids);
      await redis.set(providerKey(provider), JSON.stringify(ids), 'EX', PROVIDER_TTL_SEC);
    } catch (err) {
      log.warn({ provider, err: errMessage(err) }, 'setAndEarnBoard: provider lookup failed');
    }
  }

  // The board's agents: campaign registrations (to as_of and the campaign's end) and older agents read from the registry.
  const lastListed = Math.min(asOfBlock, endBlock ?? Infinity);
  const known = () => new Map([...regs].filter(([, r]) => !r.registered_during_campaign || (r.registered_block ?? Infinity) <= lastListed));
  const rank = () => boardOrder(hiresByAgent({ registrations: known(), hires: hireList, completions, providerAgents }));
  let ordered = rank();

  // Agents the board shows or traces that weren't seen registering: read from the registry once each.
  const needed = [...ordered.slice(0, BOARD_MAX_ROWS), ...ordered.filter((s) => s.distinct_hirers >= MIN_DISTINCT_HIRERS)];
  const unread = [...new Set(needed.map((s) => s.agent_id))].filter((id) => !regs.has(id));
  const read = await mapLimit(unread, REGISTRY_CONCURRENCY, async (id) => {
    try {
      const agent = await retrying(() => readRegistryAgent(pointCall, rpcUrl, id));
      return agent ? describeRegistryAgent(id, agent) : null;
    } catch {
      return null;
    }
  });
  const readOk = read.filter((r): r is AgentRegistration => r !== null);
  for (const r of readOk) regs.set(r.agent_id, r);
  await hsetMany(redis, SET_AND_EARN_KEYS.registrations, readOk.map((r) => [String(r.agent_id), JSON.stringify(r)]));
  if (readOk.length < unread.length) log.warn({ unread: unread.length - readOk.length }, 'setAndEarnBoard: agents not readable from the registry');
  if (readOk.length) ordered = rank(); // a newly read agent wallet can match an ERC-8183 provider

  // Registration times for campaign agents that make the board, once each.
  const undated = ordered
    .slice(0, BOARD_MAX_ROWS)
    .flatMap((s) => {
      const r = regs.get(s.agent_id);
      return r && !r.registered_at && r.registered_block !== null ? [r] : [];
    });
  await dateRegistrations(undated);

  // Verdicts, in board order, within the lookup budget.
  const baseGraph =
    deps.graph ??
    bscFundingGraph({
      alchemyUrl: deps.alchemyUrl,
      rpcUrl,
      rpcCall: pointCall,
      windowFromBlock: asOfBlock - HIRE_WINDOW_DAYS * SELLER_BLOCKS_PER_DAY.bsc,
      log: warnLog,
    });
  const graph = cachedGraph(baseGraph, redis, pace, counters);
  const previous = previousRows(await redis.get(SET_AND_EARN_KEYS.latest));

  const check = async (s: AgentHireStats, reg: AgentRegistration): Promise<HireSummary> => {
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
    const reg = regs.get(s.agent_id);
    if (!reg) {
      verdicts.set(s.agent_id, previousVerdict(previous.get(s.agent_id), 'error'));
      return;
    }
    if (counters.alchemy_lookups >= budget) {
      verdicts.set(s.agent_id, previousVerdict(previous.get(s.agent_id), 'pending'));
      return;
    }
    traced += 1;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        verdicts.set(s.agent_id, { status: 'checked', summary: await check(s, reg), checked_at: now().toISOString() });
        break;
      } catch (err) {
        log.warn({ agent: s.agent_id, attempt, err: errMessage(err) }, 'setAndEarnBoard: hire check failed');
        if (attempt === 1) await sleep(RETRY_PAUSE_MS); // let the compute-unit budget refill
        else verdicts.set(s.agent_id, previousVerdict(previous.get(s.agent_id), 'error'));
      }
    }
    await sleep(AGENT_PAUSE_MS);
  });

  // Older agents on the board: registration block from their mint to the current owner, with what's left of the budget.
  const unminted = ordered
    .slice(0, BOARD_MAX_ROWS)
    .flatMap((s) => {
      const r = regs.get(s.agent_id);
      return r && !r.registered_during_campaign && r.registered_block === null && !r.mint_checked ? [r] : [];
    });
  const byOwner = new Map<string, AgentRegistration[]>();
  for (const r of unminted) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);
  const minted: AgentRegistration[] = [];
  for (const [owner, group] of [...byOwner].slice(0, MINT_LOOKUPS_PER_RUN)) {
    if (counters.alchemy_lookups >= budget) break;
    counters.alchemy_lookups += 1;
    try {
      const blocks = new Map((await pace(() => mintsTo(owner))).map((m) => [m.agent_id, m.block]));
      for (const r of group) {
        r.registered_block = blocks.get(r.agent_id) ?? null;
        r.mint_checked = true;
        minted.push(r);
      }
    } catch (err) {
      log.warn({ owner, err: errMessage(err) }, 'setAndEarnBoard: mint lookup failed');
    }
  }
  await hsetMany(redis, SET_AND_EARN_KEYS.registrations, minted.map((r) => [String(r.agent_id), JSON.stringify(r)]));
  await dateRegistrations(minted.filter((r) => r.registered_block !== null));

  const board = assembleSetAndEarnBoard({
    registrations: known(),
    hires: hireList,
    completions,
    verdicts,
    asOf,
    generatedAt: now().toISOString(),
    providerAgents,
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
