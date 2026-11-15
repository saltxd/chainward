import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import type { TransactionInsert } from '../../lib/transactionStore.js';

// The rate limiter end to end: the webhook path with the real limiter on an
// in-memory Redis. More than 10 counted sends in a minute pause the wallet for
// 5 minutes, queue one notice to its owner, and shed its inbound transfers.
// A keeper bot's contract calls (rows with no token and a zero amount) must
// not do that; value transfers still must.

const client = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBlock: vi.fn(),
};

const queued: Array<{ queue: string; name: string; data: Record<string, unknown> }> = [];
const stored: TransactionInsert[] = [];

/** Just enough of ioredis for the rate limiter: counters, TTLs, pause keys. */
const redis = vi.hoisted(() => {
  const values = new Map<string, string>();
  const ttls = new Map<string, number>();
  const ops = {
    incr: (key: string) => {
      const next = Number(values.get(key) ?? '0') + 1;
      values.set(key, String(next));
      return next;
    },
    ttl: (key: string) => (values.has(key) ? (ttls.get(key) ?? -1) : -2),
    setex: (key: string, seconds: number, value: string) => {
      values.set(key, value);
      ttls.set(key, seconds);
      return 'OK';
    },
    del: (key: string) => {
      ttls.delete(key);
      return values.delete(key) ? 1 : 0;
    },
  };
  return {
    values,
    reset: () => {
      values.clear();
      ttls.clear();
    },
    exists: async (key: string) => (values.has(key) ? 1 : 0),
    expire: async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    },
    get: async (key: string) => values.get(key) ?? null,
    setex: async (key: string, seconds: number, value: string) => ops.setex(key, seconds, value),
    pipeline: () => {
      const steps: Array<() => unknown> = [];
      const chain = {
        incr: (key: string) => (steps.push(() => ops.incr(key)), chain),
        ttl: (key: string) => (steps.push(() => ops.ttl(key)), chain),
        setex: (key: string, seconds: number, value: string) => (steps.push(() => ops.setex(key, seconds, value)), chain),
        del: (key: string) => (steps.push(() => ops.del(key)), chain),
        exec: async () => steps.map((step) => [null, step()]),
      };
      return chain;
    },
  };
});

vi.mock('../../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../../lib/queue.js', () => ({
  createQueue: (queue: string) => ({
    add: async (name: string, data: Record<string, unknown>) => {
      queued.push({ queue, name, data });
    },
    close: async () => undefined,
  }),
}));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/db.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => [{ walletAddress: WALLET }] }) }),
  }),
}));
vi.mock('../../lib/transactionStore.js', () => ({
  storeTransaction: vi.fn(async (_db: unknown, tx: TransactionInsert) => {
    const duplicate = stored.some(
      (row) => row.txHash === tx.txHash && row.walletAddress === tx.walletAddress && row.direction === tx.direction,
    );
    if (duplicate) return { inserted: false, ingestedAt: null };
    stored.push(tx);
    return { inserted: true, ingestedAt: new Date() };
  }),
}));
vi.mock('../../lib/viem.js', () => ({ getBaseClient: () => client }));
vi.mock('../../processors/tokenResolver.js', () => ({ resolveToken: vi.fn(async () => ({ symbol: 'USDC' })) }));
vi.mock('../../processors/protocolResolver.js', () => ({ resolveProtocol: vi.fn(async () => null) }));
vi.mock('../../processors/priceResolver.js', () => ({
  getEthPrice: vi.fn(async () => 3000),
  getTokenUsdPrice: vi.fn(async () => 1),
}));
vi.mock('../../processors/agentResolver.js', () => ({ resolveAgentByAddress: vi.fn(async () => null) }));
vi.mock('../backfill.js', () => ({ backfillAgent: vi.fn() }));
vi.mock('../transferBackfill.js', () => ({ alchemyBackfillAvailable: () => false, backfillWalletViaTransfers: vi.fn() }));

import { handleWebhookTx } from '../baseIndexer.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const PAYER = '0x5555555555555555555555555555555555555555';
const KEEPER_TARGET = '0x2222222222222222222222222222222222222222';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const POKE_INPUT = encodeFunctionData({
  abi: parseAbi(['function approve(address spender, uint256 amount)']),
  args: [KEEPER_TARGET, 1n],
});

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

const activity = (n: number, over: Record<string, unknown>) => ({
  type: 'webhook' as const,
  txHash: hash(n),
  blockNumber: 100 + n,
  asset: 'ETH',
  network: 'BASE_MAINNET',
  ...over,
});

/** A zero-value call the wallet sent: stored as a row with no token and amount '0'. */
const call = (n: number) =>
  activity(n, {
    fromAddress: WALLET,
    toAddress: KEEPER_TARGET,
    value: 0,
    category: 'external',
    rawContract: { rawValue: '0x0', decimals: 18 },
  });

/** 0.01 ETH the wallet sent. */
const ethOut = (n: number) =>
  activity(n, {
    fromAddress: WALLET,
    toAddress: PAYER,
    value: 0.01,
    category: 'external',
    rawContract: { rawValue: '0x2386f26fc10000', decimals: 18 },
  });

/** 12.5 USDC paid to the wallet. */
const usdcIn = (n: number) =>
  activity(n, {
    fromAddress: PAYER,
    toAddress: WALLET,
    value: 12.5,
    asset: 'USDC',
    category: 'token',
    rawContract: { rawValue: '0xbebc20', address: USDC, decimals: 6 },
  });

const job = (data: unknown) => ({
  data: data as Parameters<typeof handleWebhookTx>[0]['data'],
  attemptsStarted: 1,
  timestamp: Date.now(),
});

const notices = () => queued.filter((q) => q.queue === 'alert-deliver' && q.name === 'rate-limit-warning');
const paused = () => redis.values.has(`rate:paused:${WALLET}`);
const storedHashes = () => stored.map((row) => row.txHash);

describe('handleWebhookTx and the outbound rate limit (real limiter, in-memory Redis)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.reset();
    queued.length = 0;
    stored.length = 0;
    client.getTransactionReceipt.mockResolvedValue({
      blockNumber: 100n,
      gasUsed: 46_000n,
      effectiveGasPrice: 5_000_000n,
      status: 'success',
      logs: [],
    });
    client.getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
  });

  it('a keeper bot sending 20 contract calls in a minute is not paused and keeps its inbound payments', async () => {
    client.getTransaction.mockResolvedValue({ input: POKE_INPUT, to: KEEPER_TARGET });
    for (let n = 1; n <= 20; n++) await handleWebhookTx(job(call(n)));
    expect(stored).toHaveLength(20);
    expect(stored.every((row) => row.tokenAddress === null && row.amountRaw === '0')).toBe(true);

    expect(paused()).toBe(false);
    expect(notices()).toEqual([]);

    client.getTransaction.mockResolvedValue({ input: '0x', to: USDC });
    await handleWebhookTx(job(usdcIn(21)));
    expect(storedHashes()).toContain(hash(21));
  });

  it('a wallet sending 11 value transfers in a minute is still paused once, its owner told once, its inbound shed', async () => {
    client.getTransaction.mockResolvedValue({ input: '0x', to: PAYER });
    for (let n = 1; n <= 10; n++) await handleWebhookTx(job(ethOut(n)));
    expect(paused()).toBe(false);
    expect(notices()).toEqual([]);

    await handleWebhookTx(job(ethOut(11)));
    expect(paused()).toBe(true);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.data).toMatchObject({ type: 'rate-limit', walletAddress: WALLET });

    // Outbound is never shed while paused; inbound is.
    await handleWebhookTx(job(ethOut(12)));
    client.getTransaction.mockResolvedValue({ input: '0x', to: USDC });
    await handleWebhookTx(job(usdcIn(13)));
    expect(storedHashes()).toContain(hash(12));
    expect(storedHashes()).not.toContain(hash(13));
    expect(notices()).toHaveLength(1);
  });

  it('contract calls mixed in do not bring the pause closer: 10 transfers plus calls stay under the limit', async () => {
    for (let n = 1; n <= 10; n++) {
      client.getTransaction.mockResolvedValue({ input: '0x', to: PAYER });
      await handleWebhookTx(job(ethOut(2 * n)));
      client.getTransaction.mockResolvedValue({ input: POKE_INPUT, to: KEEPER_TARGET });
      await handleWebhookTx(job(call(2 * n + 1)));
    }
    expect(stored).toHaveLength(20);
    expect(paused()).toBe(false);
    expect(notices()).toEqual([]);
  });
});
