import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, pad, parseAbi } from 'viem';
import type { TransactionInsert } from '../../lib/transactionStore.js';

// The webhook path end to end, from the job to the stored rows and queued
// alerts, with the chain and the database faked: a contract call the wallet
// sent becomes one row (approval, reverted call), a swap stays its token legs
// whichever batch they arrive in, and calls the wallet did not send store
// nothing.

const client = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBlock: vi.fn(),
};

const queued: Array<{ queue: string; data: Record<string, unknown>; opts?: Record<string, unknown> }> = [];
const stored: TransactionInsert[] = [];

/** Same identity as the real store's existence check, minus the gas rule (tested on Postgres). */
const sameRow = (a: TransactionInsert, b: TransactionInsert) =>
  (['txHash', 'walletAddress', 'direction', 'status', 'counterparty', 'tokenAddress', 'amountRaw', 'contractAddress', 'methodId'] as const)
    .every((k) => (a[k] ?? null) === (b[k] ?? null));

vi.mock('../../lib/queue.js', () => ({
  createQueue: (queue: string) => ({
    add: async (_name: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => {
      queued.push({ queue, data, opts });
    },
    close: async () => undefined,
  }),
}));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({ get: async () => 'claimRewards', setex: async () => 'OK' }) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/db.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => [{ walletAddress: WALLET }] }) }),
  }),
}));
vi.mock('../../lib/transactionStore.js', () => ({
  storeTransaction: vi.fn(async (_db: unknown, tx: TransactionInsert) => {
    const existing = stored.find((row) => sameRow(row, tx));
    if (existing) return { inserted: false, ingestedAt: existing.ingestedAt };
    const row = { ...tx, ingestedAt: new Date() };
    stored.push(row);
    return { inserted: true, ingestedAt: row.ingestedAt };
  }),
}));
// The real decisions (which legs are sends, which count toward the limit); only Redis is faked.
vi.mock('../../lib/rateLimiter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rateLimiter.js')>()),
  isAddressPaused: vi.fn(async () => false),
  recordAndCheck: vi.fn(async () => false),
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
import { alertJobId } from '../../lib/alertJobId.js';
import { recordAndCheck } from '../../lib/rateLimiter.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x5555555555555555555555555555555555555555';
const ROUTER = '0x2222222222222222222222222222222222222222';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const APPROVE_INPUT = encodeFunctionData({
  abi: parseAbi(['function approve(address spender, uint256 amount)']),
  args: [ROUTER, 1_000_000n],
});
const SWAP_INPUT = encodeFunctionData({
  abi: parseAbi(['function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline)']),
  args: [12_500_000n, 0n, [], WALLET, 0n],
});

const receipt = (over: Record<string, unknown> = {}) => ({
  blockNumber: 100n,
  gasUsed: 46_000n,
  effectiveGasPrice: 5_000_000n,
  status: 'success',
  logs: [],
  ...over,
});

const usdcOut = {
  address: USDC,
  topics: [TRANSFER_TOPIC, pad(WALLET as `0x${string}`), pad(ROUTER as `0x${string}`)],
  data: '0x',
};

const callActivity = (from = WALLET, to = USDC, category = 'external') => ({
  type: 'webhook' as const,
  txHash: TX_HASH,
  blockNumber: 100,
  fromAddress: from,
  toAddress: to,
  value: 0,
  asset: 'ETH',
  category,
  rawContract: { rawValue: '0x0', decimals: 18 },
  network: 'BASE_MAINNET',
});

const usdcOutActivity = {
  type: 'webhook' as const,
  txHash: TX_HASH,
  blockNumber: 100,
  fromAddress: WALLET,
  toAddress: ROUTER,
  value: 12.5,
  asset: 'USDC',
  category: 'token',
  rawContract: { rawValue: '0xbebc20', address: USDC, decimals: 6 },
  network: 'BASE_MAINNET',
};

const job = (data: unknown, attemptsStarted = 1) => ({
  data: data as Parameters<typeof handleWebhookTx>[0]['data'],
  attemptsStarted,
  timestamp: Date.now(),
});

const alertJobs = () => queued.filter((q) => q.queue === 'alert-evaluate');

describe('handleWebhookTx, contract calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queued.length = 0;
    stored.length = 0;
    client.getTransaction.mockResolvedValue({ input: APPROVE_INPUT, to: USDC });
    client.getTransactionReceipt.mockResolvedValue(receipt());
    client.getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
  });

  it('stores an approval with no transfer as one row with gas, and queues its alert', async () => {
    await handleWebhookTx(job(callActivity()));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ txType: 'approval', direction: 'out', status: 'confirmed', gasUsed: 46_000 });
    expect(alertJobs()).toHaveLength(1);
    expect(alertJobs()[0]!.data).toMatchObject({
      txHash: TX_HASH,
      status: 'confirmed',
      contractAddress: USDC,
      amountRaw: '0',
    });
    expect(alertJobs()[0]!.data.gasCostUsd).not.toBeNull();
    expect(alertJobs()[0]!.opts?.jobId).toBe(alertJobId(stored[0] as Parameters<typeof alertJobId>[0]));
  });

  it('stores a reverted call as failed with its gas, and its alert says failed', async () => {
    client.getTransactionReceipt.mockResolvedValue(receipt({ status: 'reverted' }));
    await handleWebhookTx(job(callActivity()));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: 'failed', gasUsed: 46_000 });
    expect(alertJobs()[0]!.data).toMatchObject({ status: 'failed' });
  });

  // A call row adds no inbound noise and cannot be caused by a third party, so
  // counting it would only pause the inbound payments of a busy keeper bot.
  it('does not count an approval or a reverted call toward the outbound rate limit', async () => {
    await handleWebhookTx(job(callActivity()));
    client.getTransactionReceipt.mockResolvedValue(receipt({ status: 'reverted' }));
    await handleWebhookTx(job({ ...callActivity(), txHash: `0x${'cd'.repeat(32)}` }));
    expect(stored).toHaveLength(2);
    expect(recordAndCheck).not.toHaveBeenCalled();
  });

  it('a retry of the call job stores nothing new and queues the alert under the same id', async () => {
    await handleWebhookTx(job(callActivity()));
    await handleWebhookTx(job(callActivity(), 2)); // its row was stored by this job, just now
    expect(stored).toHaveLength(1);
    const ids = alertJobs().map((q) => q.opts?.jobId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  describe('a swap: zero-value call plus the token leg the wallet sent', () => {
    beforeEach(() => {
      client.getTransaction.mockResolvedValue({ input: SWAP_INPUT, to: ROUTER });
      client.getTransactionReceipt.mockResolvedValue(receipt({ logs: [usdcOut] }));
    });

    const expectOnlyTheTokenLeg = () => {
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ tokenAddress: USDC, direction: 'out', txType: 'swap', gasUsed: 46_000 });
      expect(alertJobs()).toHaveLength(1);
      // The token the wallet sent still counts as a send, once.
      expect(recordAndCheck).toHaveBeenCalledTimes(1);
    };

    it('legs in the same batch: one row, the token leg, with the gas', async () => {
      // One webhook, two jobs, processed concurrently.
      await Promise.all([
        handleWebhookTx(job(callActivity(WALLET, ROUTER))),
        handleWebhookTx(job(usdcOutActivity)),
      ]);
      expectOnlyTheTokenLeg();
    });

    it('token leg in a later batch: still one row', async () => {
      await handleWebhookTx(job(callActivity(WALLET, ROUTER)));
      expect(stored).toEqual([]);
      await handleWebhookTx(job(usdcOutActivity));
      expectOnlyTheTokenLeg();
    });

    it('call in a later batch: still one row', async () => {
      await handleWebhookTx(job(usdcOutActivity));
      await handleWebhookTx(job(callActivity(WALLET, ROUTER)));
      expectOnlyTheTokenLeg();
    });
  });

  it('stores nothing for a zero-value call another address sent to the wallet', async () => {
    await handleWebhookTx(job(callActivity(STRANGER, WALLET)));
    expect(stored).toEqual([]);
    expect(alertJobs()).toEqual([]);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('stores nothing for a zero-value internal call', async () => {
    await handleWebhookTx(job(callActivity(WALLET, ROUTER, 'internal')));
    expect(stored).toEqual([]);
    expect(alertJobs()).toEqual([]);
  });
});
