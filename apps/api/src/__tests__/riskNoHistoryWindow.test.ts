import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// A paid check on a BNB Chain address with nothing on-chain answers no_history
// with a verdict. The reason names the window the scan read (14 days on BNB
// Chain's public RPC), not Base's 30.

const redis = vi.hoisted(() => {
  const pipeline = () => {
    const p: Record<string, unknown> = {
      exec: async () => [
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ],
    };
    for (const m of ['zremrangebyscore', 'zcard', 'zadd', 'zrem', 'expire']) p[m] = () => p;
    return p;
  };
  return { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), pipeline };
});
const riskCheck = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) q[m] = () => q;
  q.limit = async () => [];
  return { getDb: () => q };
});
vi.mock('../lib/riskChainFixtures.js', () => ({
  fetchChainFixtures: vi.fn(async () => ({
    chain: 'bsc',
    window: { days: 14, requested_days: 14 },
    sentinel_nonce: { result: '0x0' },
    sentinel_eth_balance: { result: '0x0' },
    sentinel_code: { result: '0x' },
    blockscout_transfers: { items: [] },
    stablecoin_balances: {},
  })),
  teaserStatsFromFixtures: vi.fn(),
}));

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const EMPTY = '0x2d0b6cd9485e59a6edc10b048227faf0e81d174d';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

beforeEach(() => riskCheck.add.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/risk/x402 on an empty BNB Chain address', () => {
  it('answers no_history with the 14-day window in the reason', async () => {
    const res = await app().request(`/api/risk/x402?address=${EMPTY}&chain=bsc`);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('no_history');
    expect(body.data.verdict).toMatchObject({ label: 'unknown', text: 'No track record' });
    expect(body.data.verdict.reason).toBe('No transfers in the last 14 days on this chain.');
    expect(riskCheck.add).not.toHaveBeenCalled();
  });
});
