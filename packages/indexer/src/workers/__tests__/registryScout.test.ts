import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseSecondsBetween } from '@chainward/common';

// The registry scout runs every 6 hours. Each run must cover at least the 6 hours since the last
// one, in chunks small enough for a public RPC, and move its cursor chunk by chunk.
const HEAD = 60_000_000n; // 200 ms blocks: 6 hours is 108,000 blocks
const state = vi.hoisted(() => ({ cursor: null as string | null, ranges: [] as Array<[bigint, bigint]>, saves: [] as string[] }));

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/redis.js', () => ({
  getRedis: () => ({
    get: async () => state.cursor,
    set: async (_k: string, v: string) => {
      state.saves.push(v);
      state.cursor = v;
      return 'OK';
    },
  }),
}));
vi.mock('../../lib/db.js', () => ({ getDb: () => ({ execute: async () => [] }) }));
vi.mock('../../lib/viem.js', () => ({
  getBaseClient: () => ({
    getBlockNumber: async () => 60_000_000n,
    getLogs: async (p: { fromBlock: bigint; toBlock: bigint }) => {
      state.ranges.push([p.fromBlock, p.toBlock]);
      return [];
    },
  }),
}));
vi.mock('bullmq', () => ({ Queue: vi.fn(), Worker: vi.fn() }));

import { scanRegistrations } from '../registryScout.js';

describe('registry scout run size', () => {
  beforeEach(() => {
    state.ranges.length = 0;
    state.saves.length = 0;
  });

  it('covers at least the 6-hour run interval in chunks of at most 10,000 blocks, saving the cursor per chunk', async () => {
    state.cursor = (HEAD - 1_000_000n).toString(); // far behind
    await scanRegistrations();
    expect(state.ranges.length).toBeGreaterThan(1);
    for (const [from, to] of state.ranges) expect(to - from + 1n).toBeLessThanOrEqual(10_000n);
    for (let i = 1; i < state.ranges.length; i++) expect(state.ranges[i]![0]).toBe(state.ranges[i - 1]![1] + 1n);
    const first = state.ranges[0]![0];
    const last = state.ranges[state.ranges.length - 1]![1];
    expect(baseSecondsBetween(Number(first), Number(last))).toBeGreaterThanOrEqual(6 * 3_600);
    expect(state.saves).toEqual(state.ranges.map(([, to]) => to.toString()));
  });

  it('stops at the head when it is close behind', async () => {
    state.cursor = (HEAD - 25_000n).toString();
    await scanRegistrations();
    expect(state.ranges[state.ranges.length - 1]![1]).toBe(HEAD);
    expect(state.cursor).toBe(HEAD.toString());
  });
});
