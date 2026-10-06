import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, toHex } from 'viem';

// The board builder against a fake BNB Chain (logs and headers through the
// injected rpcCall), an in-memory Redis and an injected funding graph. No
// network. The check's verdict rules are hire-check.ts's; only the wiring,
// caching and incremental scans are under test here.
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const redisRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => redisRef.current }));
const queue = vi.hoisted(() => ({
  add: vi.fn(async (..._args: unknown[]) => ({})),
  getRepeatableJobs: vi.fn(async () => [{ key: 'old-repeat' }]),
  removeRepeatableByKey: vi.fn(async (_key: string) => true),
  close: vi.fn(async () => undefined),
}));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return queue;
  }),
  Worker: vi.fn(),
}));

import {
  AGENT_WALLET_KEY_TOPIC,
  BSC_IDENTITY_REGISTRY,
  ERC8183_BSC_KERNEL,
  JOB_CREATED_TOPIC,
  METADATA_SET_TOPIC,
  ORDER_CREATED_TOPIC,
  ORDER_SETTLED_TOPIC,
  REGISTERED_TOPIC,
  SET_AND_EARN_START_BLOCK,
  TERMIX_BSC_ESCROWS,
  type FundingGraph,
  type FirstFunder,
  type RpcCall,
  type SetAndEarnBoard,
} from '@chainward/decode';
import type Redis from 'ioredis';
import {
  SET_AND_EARN_KEYS,
  buildSetAndEarnBoard,
  runSetAndEarnBoard,
  setupSetAndEarnBoardSchedule,
} from '../setAndEarnBoard.js';

// ─── In-memory Redis (the subset the worker uses) ─────────────────────────────

class FakeRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  sets = new Map<string, Set<string>>();
  ttls = new Map<string, number>();
  async get(k: string) {
    return this.strings.get(k) ?? null;
  }
  async set(k: string, v: string, mode?: string, ttl?: number) {
    this.strings.set(k, v);
    if (mode === 'EX' && ttl) this.ttls.set(k, ttl);
    return 'OK';
  }
  async exists(k: string) {
    return this.strings.has(k) || this.hashes.has(k) || this.sets.has(k) ? 1 : 0;
  }
  async hget(k: string, f: string) {
    return this.hashes.get(k)?.get(f) ?? null;
  }
  async hset(k: string, fieldOrObj: string | Record<string, string>, value?: string) {
    const h = this.hashes.get(k) ?? new Map<string, string>();
    if (typeof fieldOrObj === 'string') h.set(fieldOrObj, value!);
    else for (const [f, v] of Object.entries(fieldOrObj)) h.set(f, v);
    this.hashes.set(k, h);
    return 1;
  }
  async hgetall(k: string) {
    return Object.fromEntries(this.hashes.get(k) ?? []);
  }
  async sadd(k: string, ...members: string[]) {
    const s = this.sets.get(k) ?? new Set<string>();
    for (const m of members.flat()) s.add(m);
    this.sets.set(k, s);
    return members.length;
  }
  async smembers(k: string) {
    return [...(this.sets.get(k) ?? [])];
  }
  async expire(k: string, ttl: number) {
    this.ttls.set(k, ttl);
    return 1;
  }
}

// ─── A fake BNB Chain ─────────────────────────────────────────────────────────

const B = SET_AND_EARN_START_BLOCK;
const REGISTRY = BSC_IDENTITY_REGISTRY.toLowerCase();
const ESCROW = TERMIX_BSC_ESCROWS[0]!.toLowerCase();
const KERNEL = ERC8183_BSC_KERNEL.toLowerCase();
const T0 = Date.parse('2026-10-01T00:00:00Z') / 1000;
const topic = (a: string | number) =>
  '0x' + (typeof a === 'string' ? a.toLowerCase().replace(/^0x/, '') : BigInt(a).toString(16)).padStart(64, '0');
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

interface ChainLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

class FakeChain {
  logs: ChainLog[] = [];
  head = 0;
  calls: Array<{ method: string; params: unknown[] }> = [];
  private li = 0;
  add(address: string, topics: string[], data: string, block: number) {
    this.logs.push({ address, topics, data, blockNumber: toHex(block), transactionHash: `0x${(this.li + 1).toString(16).padStart(64, 'a')}`, logIndex: toHex(this.li++) });
  }
  register(id: number, owner: string, uri: string, block: number) {
    this.add(REGISTRY, [REGISTERED_TOPIC, topic(id), topic(owner)], encodeAbiParameters([{ type: 'string' }], [uri]), block);
    this.add(
      REGISTRY,
      [METADATA_SET_TOPIC, topic(id), AGENT_WALLET_KEY_TOPIC],
      encodeAbiParameters([{ type: 'string' }, { type: 'bytes' }], ['agentWallet', owner as `0x${string}`]),
      block,
    );
  }
  order(order: number, hirer: string, agentId: number, block: number) {
    this.add(ESCROW, [ORDER_CREATED_TOPIC, topic(order), topic(hirer), topic(agentId)], '0x', block);
  }
  settle(order: number, block: number) {
    this.add(ESCROW, [ORDER_SETTLED_TOPIC, topic(order)], '0x', block);
  }
  job(job: number, hirer: string, provider: string, block: number) {
    this.add(KERNEL, [JOB_CREATED_TOPIC, topic(job), topic(hirer), topic(provider)], '0x', block);
  }
  rpcCall: RpcCall = async (_url, method, params) => {
    this.calls.push({ method, params });
    if (method === 'eth_blockNumber') return toHex(this.head);
    if (method === 'eth_getBlockByNumber') {
      const block = Number(BigInt(params[0] as string));
      return { number: params[0], timestamp: toHex(T0 + Math.floor((block - B) * 0.45)) };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address: string[]; topics: [string[]]; fromBlock: string; toBlock: string };
      const from = Number(BigInt(f.fromBlock));
      const to = Number(BigInt(f.toBlock));
      if (to > this.head) throw new Error('block range beyond head');
      const addresses = f.address.map((a) => a.toLowerCase());
      return this.logs.filter((l) => {
        const b = Number(BigInt(l.blockNumber));
        return b >= from && b <= to && addresses.includes(l.address) && f.topics[0].includes(l.topics[0]!);
      });
    }
    throw new Error(`unexpected ${method}`);
  };
  logRanges() {
    return this.calls
      .filter((c) => c.method === 'eth_getLogs')
      .map((c) => {
        const f = c.params[0] as { fromBlock: string; toBlock: string };
        return [Number(BigInt(f.fromBlock)), Number(BigInt(f.toBlock))] as const;
      });
  }
}

/** A funding graph from a table of first funders; everything else is an unfunded EOA. */
function fakeGraph(native: Record<string, string>, opts: { failFor?: Set<string>; failOnce?: Set<string> } = {}) {
  const calls: string[] = [];
  const graph: FundingGraph = {
    firstFunder: async (kind, address): Promise<FirstFunder | null> => {
      calls.push(`${kind}:${address}`);
      if (opts.failFor?.has(address)) throw new Error('transfer source throttled');
      if (opts.failOnce?.delete(address)) throw new Error('transfer source throttled');
      const from = kind === 'native' ? native[address] : undefined;
      return from ? { from, block: B - 1000 } : null;
    },
    isHub: async () => false,
    isContract: async () => false,
  };
  return { graph, calls };
}

// Agents: A (TermiX, 3 distinct hirers), Bee (Dolphin, 1 TermiX + 1 ERC-8183 hire), C (no hires),
// OLD (registered before the campaign; its hire is not counted).
const A = 361200;
const BEE = 361201;
const C = 361202;
const OLD = 300000;
const OA = addr(0xa0);
const OB = addr(0xb0);
const H = (n: number) => addr(0x100 + n);
const F = (n: number) => addr(0x200 + n);

function campaignChain(): FakeChain {
  const chain = new FakeChain();
  chain.register(OLD, addr(0xc0), 'https://termix.ai/a/old.json', B - 50);
  chain.register(A, OA, JSON.stringify({ name: 'Alpha', url: 'https://termix.ai/agents/361200' }), B + 10);
  chain.register(BEE, OB, 'https://www.dolphinamp.xyz/a/bee', B + 11);
  chain.register(C, addr(0xc1), '', B + 12);
  chain.order(1, H(1), A, B + 100);
  chain.order(2, H(2), A, B + 101);
  chain.order(3, H(3), A, B + 102);
  chain.settle(1, B + 150);
  chain.order(4, H(4), BEE, B + 103);
  chain.order(5, H(5), OLD, B + 104);
  chain.job(56900, H(6), OB, B + 105);
  chain.head = B + 450_005;
  return chain;
}

const FUNDERS = { [H(1)]: F(1), [H(2)]: F(2), [H(3)]: F(3), [OA]: F(9), [H(4)]: OB, [H(6)]: F(6), [H(7)]: F(7) };
const RPCS = [{ url: 'https://bsc.test', logChunkBlocks: 10_000 }];
const NOW = new Date('2026-10-06T06:00:00.000Z');

describe('runSetAndEarnBoard', () => {
  let redis: FakeRedis;
  beforeEach(() => {
    redis = new FakeRedis();
    redisRef.current = redis;
  });
  const run = (chain: FakeChain, graph: FundingGraph, over: Record<string, unknown> = {}) =>
    runSetAndEarnBoard({
      redis: redis as unknown as Redis,
      alchemyUrl: 'https://alchemy.test',
      rpcs: RPCS,
      rpcCall: chain.rpcCall,
      graph,
      now: () => NOW,
      sleep: async () => undefined,
      ...over,
    });
  const stored = () => JSON.parse(redis.strings.get(SET_AND_EARN_KEYS.latest)!) as SetAndEarnBoard;

  it('lists hired campaign agents with the hire check verdict and stores the board with a dated copy', async () => {
    const chain = campaignChain();
    const { graph } = fakeGraph(FUNDERS);
    await run(chain, graph);

    const board = stored();
    expect(board.generated_at).toBe(NOW.toISOString());
    expect(board.as_of.block).toBe(chain.head - 5);
    expect(board.as_of.time).toBe(new Date((T0 + Math.floor((chain.head - 5 - B) * 0.45)) * 1000).toISOString());
    expect(board.totals).toEqual({
      agents_registered: 3,
      agents_on_campaign_marketplaces: 2,
      agents_with_hires: 2,
      hires: { total: 5, by_source: { termix_escrow: 4, erc8183_shared: 1 } },
      agents_with_3_distinct_hirers: 1,
      agents_passing: 1,
    });
    expect(board.rows.map((r) => r.agent_id)).toEqual([A, BEE]);
    expect(board.rows[0]).toMatchObject({
      agent_id: A,
      name: 'Alpha',
      owner: OA,
      marketplace: 'termix',
      hires_total: 3,
      completed: 1,
      distinct_hirers: 3,
      verdict_status: 'checked',
      owner_linked: 0,
      independent_within_limits: 3,
      passes_three_independent: true,
      checked_at: NOW.toISOString(),
    });
    expect(board.rows[0]!.registered_at).toBe(new Date((T0 + Math.floor(10 * 0.45)) * 1000).toISOString());
    expect(board.rows[1]).toMatchObject({ agent_id: BEE, marketplace: 'dolphin', hires_total: 2, distinct_hirers: 2, verdict_status: 'fewer_than_3_hirers' });

    expect(redis.strings.get('set-and-earn:board:2026-10-06')).toBe(redis.strings.get(SET_AND_EARN_KEYS.latest));
    expect(redis.ttls.get('set-and-earn:board:2026-10-06')).toBe(90 * 86_400);
    expect(redis.strings.get(SET_AND_EARN_KEYS.registryCursor)).toBe(String(chain.head - 5));
    expect(redis.strings.get(SET_AND_EARN_KEYS.hiresCursor)).toBe(String(chain.head - 5));
    // A hirer's first funder is cached with its block for 30 days; an address with none is not cached.
    expect(JSON.parse(redis.hashes.get(`set-and-earn:funder:${H(1)}`)!.get('native')!)).toEqual({ from: F(1), block: B - 1000 });
    expect(redis.ttls.get(`set-and-earn:funder:${H(1)}`)).toBe(30 * 86_400);
    expect(redis.hashes.get(`set-and-earn:funder:${F(1)}`)?.get('native')).toBeUndefined();
  });

  it('reads getLogs in chunks of at most 10,000 blocks, starting at Set and Earn\'s first block', async () => {
    const chain = campaignChain();
    await run(chain, fakeGraph(FUNDERS).graph);
    const ranges = chain.logRanges();
    expect(Math.min(...ranges.map((r) => r[0]))).toBe(B);
    expect(Math.max(...ranges.map((r) => r[1] - r[0] + 1))).toBeLessThanOrEqual(10_000);
  });

  it('on the next run reads only new blocks and reuses cached funders', async () => {
    const chain = campaignChain();
    await run(chain, fakeGraph(FUNDERS).graph);
    const firstHead = chain.head - 5;
    chain.calls = [];
    chain.order(7, H(7), BEE, chain.head + 10);
    chain.head += 50_000;

    const second = fakeGraph(FUNDERS);
    await run(chain, second.graph);
    expect(Math.min(...chain.logRanges().map((r) => r[0]))).toBe(firstHead + 1);
    // Their first BNB funders come from the cache; "no stablecoin funder yet" is asked again.
    const lookups = second.calls.filter((c) => [H(1), H(2), H(3), OA].some((a) => c.endsWith(a)));
    expect(lookups.filter((c) => c.startsWith('native:'))).toEqual([]);
    expect(lookups.filter((c) => c.startsWith('stable:'))).toHaveLength(4);

    const bee = stored().rows.find((r) => r.agent_id === BEE)!;
    // Bee's hirers: H4 (funded by Bee's owner), H6 (ERC-8183), H7.
    expect(bee).toMatchObject({ hires_total: 3, distinct_hirers: 3, verdict_status: 'checked', owner_linked: 1, independent_within_limits: 2, passes_three_independent: false });
    expect(stored().totals.agents_passing).toBe(1);
  });

  it('retries an agent once after a pause when its check fails, then reports error', async () => {
    const chain = campaignChain();
    const sleep = vi.fn(async () => undefined);
    await run(chain, fakeGraph(FUNDERS, { failOnce: new Set([H(2)]) }).graph, { sleep });
    expect(stored().rows[0]).toMatchObject({ verdict_status: 'checked', passes_three_independent: true });
    expect(sleep).toHaveBeenCalledWith(20_000);

    // H2 has no stablecoin funder, so that lookup is never cached and fails on every run.
    const later = new Date('2026-10-07T06:00:00.000Z');
    await run(chain, fakeGraph(FUNDERS, { failFor: new Set([H(2)]) }).graph, { sleep, now: () => later });
    // The earlier verdict is kept, with its checked_at, rather than replaced by the failure.
    expect(stored().generated_at).toBe(later.toISOString());
    expect(stored().rows[0]).toMatchObject({ verdict_status: 'checked', checked_at: NOW.toISOString() });

    redis.strings.delete(SET_AND_EARN_KEYS.latest);
    await run(chain, fakeGraph(FUNDERS, { failFor: new Set([H(2)]) }).graph, { sleep, now: () => later });
    expect(stored().rows[0]).toMatchObject({ verdict_status: 'error', passes_three_independent: null, checked_at: null });
  });

  it('stops tracing at the funding-lookup budget: pending, or the previous verdict', async () => {
    const chain = campaignChain();
    await run(chain, fakeGraph(FUNDERS).graph, { traceBudget: 0 });
    expect(stored().rows[0]).toMatchObject({ verdict_status: 'pending', passes_three_independent: null });

    await run(chain, fakeGraph(FUNDERS).graph);
    const later = new Date('2026-10-07T06:00:00.000Z');
    await run(chain, fakeGraph(FUNDERS).graph, { traceBudget: 0, now: () => later });
    expect(stored().generated_at).toBe(later.toISOString());
    expect(stored().rows[0]).toMatchObject({ verdict_status: 'checked', passes_three_independent: true, checked_at: NOW.toISOString() });
  });

  it('keeps what it scanned when a log chunk cannot be read, and builds the board up to there', async () => {
    const chain = campaignChain();
    const flaky: RpcCall = async (url, method, params, t) => {
      const f = params[0] as { fromBlock?: string } | undefined;
      if (method === 'eth_getLogs' && Number(BigInt(f!.fromBlock!)) >= B + 400_000) throw new Error('upstream 502');
      return chain.rpcCall(url, method, params, t);
    };
    await run(chain, fakeGraph(FUNDERS).graph, { rpcCall: flaky });
    const board = stored();
    expect(board.as_of.block).toBeLessThan(B + 400_000);
    expect(board.as_of.block).toBeGreaterThanOrEqual(B + 105);
    expect(board.totals.agents_with_hires).toBe(2);
  });
});

describe('buildSetAndEarnBoard', () => {
  it('is skipped without an Alchemy URL for the funding traces', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', '');
    vi.stubEnv('BASE_RPC_URL', 'http://localhost:8545');
    vi.stubEnv('SELLER_DEMAND_BSC_RPC_URL', '');
    redisRef.current = new FakeRedis();
    await expect(buildSetAndEarnBoard()).resolves.toEqual({ skipped: 'no_rpc' });
    vi.unstubAllEnvs();
  });
});

describe('setupSetAndEarnBoardSchedule', () => {
  beforeEach(() => {
    queue.add.mockClear();
    queue.removeRepeatableByKey.mockClear();
  });

  it('runs daily at 06:00 UTC and once now when there is no board yet', async () => {
    const redis = new FakeRedis();
    await setupSetAndEarnBoardSchedule(redis as unknown as Redis);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-repeat');
    expect(queue.add).toHaveBeenCalledWith(
      'set-and-earn-board-daily',
      {},
      { repeat: { pattern: '0 6 * * *', tz: 'UTC' }, jobId: 'set-and-earn-board-daily' },
    );
    expect(queue.add.mock.calls.some((c) => c[0] === 'set-and-earn-board-initial')).toBe(true);
  });

  it('does not queue a startup run when the board exists', async () => {
    const redis = new FakeRedis();
    await redis.set(SET_AND_EARN_KEYS.latest, '{}');
    await setupSetAndEarnBoardSchedule(redis as unknown as Redis);
    expect(queue.add.mock.calls.map((c) => c[0])).toEqual(['set-and-earn-board-daily']);
  });
});
