import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedTransaction } from '../../processors/baseProcessor.js';

// A webhook job that fails part way (database blip on an insert, Redis blip
// while queueing the alert) used to swallow the error, so BullMQ marked the job
// done and the leg was lost. Now the job fails and is retried, and a retry must
// not store a leg twice or lose the alert of a leg the first attempt stored.

const queued: Array<{ queue: string; name: string; data: Record<string, unknown>; opts?: Record<string, unknown> }> = [];
const queueAdd = vi.fn(async (queue: string, name: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => {
  queued.push({ queue, name, data, opts });
});

vi.mock('../../lib/queue.js', () => ({
  createQueue: (queue: string) => ({
    add: (name: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => queueAdd(queue, name, data, opts),
    close: async () => undefined,
  }),
}));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({}) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/db.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => [{ walletAddress: WALLET }] }) }),
  }),
}));
vi.mock('../../lib/transactionStore.js', () => ({ insertTransactionIfNew: vi.fn() }));
vi.mock('../../lib/rateLimiter.js', () => ({
  isOutbound: (direction: string) => direction !== 'in',
  isAddressPaused: vi.fn(async () => false),
  recordAndCheck: vi.fn(async () => false),
}));
vi.mock('../../processors/baseProcessor.js', () => ({ processWebhookTx: vi.fn() }));
vi.mock('../backfill.js', () => ({ backfillAgent: vi.fn() }));
vi.mock('../transferBackfill.js', () => ({ alchemyBackfillAvailable: () => false, backfillWalletViaTransfers: vi.fn() }));
vi.mock('../../lib/viem.js', () => ({ getBaseClient: vi.fn() }));

import { handleWebhookTx } from '../baseIndexer.js';
import { insertTransactionIfNew } from '../../lib/transactionStore.js';
import { recordAndCheck } from '../../lib/rateLimiter.js';
import { processWebhookTx } from '../../processors/baseProcessor.js';
import { alertJobId } from '../../lib/alertJobId.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const TX_HASH = `0x${'ab'.repeat(32)}`;

const insert = vi.mocked(insertTransactionIfNew);
const processTx = vi.mocked(processWebhookTx);

function leg(over: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    timestamp: new Date('2026-11-09T12:00:00.000Z'),
    chain: 'base',
    txHash: TX_HASH,
    blockNumber: 100,
    walletAddress: WALLET,
    direction: 'out',
    counterparty: '0x2222222222222222222222222222222222222222',
    tokenAddress: null,
    tokenSymbol: 'ETH',
    tokenDecimals: 18,
    amountRaw: '500000000000000000',
    amountUsd: '1500.000000',
    gasUsed: 21_000,
    gasPriceGwei: '0.000000001',
    gasCostNative: '0.000000000000021',
    gasCostUsd: '0.000000',
    txType: 'transfer',
    methodId: null,
    methodName: null,
    contractAddress: '0x2222222222222222222222222222222222222222',
    protocolName: null,
    isAgentInteraction: false,
    counterpartyAgentId: null,
    status: 'confirmed',
    rawData: null,
    ...over,
  };
}

const ethLeg = leg();
const tokenLeg = leg({ tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amountRaw: '12500000' });

const webhookData = {
  type: 'webhook' as const,
  txHash: TX_HASH,
  blockNumber: 100,
  fromAddress: WALLET,
  toAddress: '0x2222222222222222222222222222222222222222',
  value: 0.5,
  asset: 'ETH',
  category: 'external',
  network: 'BASE_MAINNET',
};

const firstAttempt = { data: webhookData, attemptsStarted: 1 };
const retry = { data: webhookData, attemptsStarted: 2 };

const alertJobs = () => queued.filter((j) => j.queue === 'alert-evaluate');

describe('handleWebhookTx retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queued.length = 0;
    processTx.mockResolvedValue([ethLeg, tokenLeg]);
  });

  it('fails the job when a leg cannot be stored, after handling the other legs', async () => {
    insert.mockRejectedValueOnce(new Error('connection terminated')).mockResolvedValueOnce(true);
    await expect(handleWebhookTx(firstAttempt)).rejects.toThrow(/connection terminated/);
    // The leg that failed to store queued no alert; the other leg did.
    expect(alertJobs().map((j) => j.opts?.jobId)).toEqual([alertJobId(tokenLeg)]);
  });

  it('fails the job when the alert cannot be queued after the insert', async () => {
    insert.mockResolvedValue(true);
    queueAdd.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(handleWebhookTx(firstAttempt)).rejects.toThrow(/Redis connection lost/);
  });

  it('on a retry, queues the alert of a leg the failed attempt already stored, under the same job id', async () => {
    insert.mockResolvedValue(false); // both rows were stored by the attempt that failed
    await handleWebhookTx(retry);
    expect(alertJobs().map((j) => j.opts?.jobId)).toEqual([alertJobId(ethLeg), alertJobId(tokenLeg)]);
    // The send was counted toward the rate limit when the row was stored, not again.
    expect(recordAndCheck).not.toHaveBeenCalled();
  });

  it('on a first attempt, a leg that is already stored (a duplicate webhook) queues no alert', async () => {
    insert.mockResolvedValue(false);
    await handleWebhookTx(firstAttempt);
    expect(alertJobs()).toEqual([]);
  });

  it('queues each alert with bounded exponential backoff', async () => {
    insert.mockResolvedValue(true);
    await handleWebhookTx(firstAttempt);
    for (const job of alertJobs()) {
      expect(job.opts).toMatchObject({ attempts: expect.any(Number), backoff: { type: 'exponential' } });
      expect(job.opts!.attempts as number).toBeGreaterThan(1);
      expect(job.opts!.attempts as number).toBeLessThanOrEqual(10);
    }
  });

  it('drops a malformed job with a log line instead of retrying it', async () => {
    await expect(handleWebhookTx({ data: { ...webhookData, txHash: 'not-a-hash' }, attemptsStarted: 1 })).resolves.toBeUndefined();
    expect(processTx).not.toHaveBeenCalled();
  });
});
