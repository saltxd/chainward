import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedTransaction } from '../../processors/baseProcessor.js';

// A webhook job that fails part way (database blip on an insert, Redis blip
// while queueing the alert) used to swallow the error, so BullMQ marked the job
// done and the leg was lost. Now the job fails and is retried, and a retry must
// not store a leg twice, must not lose the alert of a leg it stored, and must
// not queue an alert for a leg an earlier job stored long ago.

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
vi.mock('../../lib/transactionStore.js', () => ({ storeTransaction: vi.fn() }));
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
import { storeTransaction } from '../../lib/transactionStore.js';
import { recordAndCheck } from '../../lib/rateLimiter.js';
import { processWebhookTx } from '../../processors/baseProcessor.js';
import { alertJobId } from '../../lib/alertJobId.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const TX_HASH = `0x${'ab'.repeat(32)}`;

const store = vi.mocked(storeTransaction);
const processTx = vi.mocked(processWebhookTx);

/** When the API created the job (its clock). */
const JOB_CREATED = Date.parse('2026-11-14T00:00:00.000Z');
const at = (offsetMs: number) => new Date(JOB_CREATED + offsetMs);

const inserted = (offsetMs = 1_000) => ({ inserted: true, ingestedAt: at(offsetMs) });
const alreadyStored = (offsetMs: number) => ({ inserted: false, ingestedAt: at(offsetMs) });

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

const firstAttempt = { data: webhookData, attemptsStarted: 1, timestamp: JOB_CREATED };
const retry = { data: webhookData, attemptsStarted: 2, timestamp: JOB_CREATED };

const alertJobs = () => queued.filter((j) => j.queue === 'alert-evaluate');

describe('handleWebhookTx retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queued.length = 0;
    processTx.mockResolvedValue([ethLeg, tokenLeg]);
  });

  it('fails the job when a leg cannot be stored, after handling the other legs', async () => {
    store.mockRejectedValueOnce(new Error('connection terminated')).mockResolvedValueOnce(inserted());
    await expect(handleWebhookTx(firstAttempt)).rejects.toThrow(/connection terminated/);
    // The leg that failed to store queued no alert; the other leg did.
    expect(alertJobs().map((j) => j.opts?.jobId)).toEqual([alertJobId(tokenLeg)]);
  });

  it('fails the job when the alert cannot be queued after the insert', async () => {
    store.mockResolvedValue(inserted());
    queueAdd.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(handleWebhookTx(firstAttempt)).rejects.toThrow(/Redis connection lost/);
  });

  it('on a retry, queues the alert of a leg this job stored, under the same job id', async () => {
    store.mockResolvedValue(alreadyStored(1_000)); // stored by the attempt that failed
    await handleWebhookTx(retry);
    expect(alertJobs().map((j) => j.opts?.jobId)).toEqual([alertJobId(ethLeg), alertJobId(tokenLeg)]);
    // The send was counted toward the rate limit when the row was stored, not again.
    expect(recordAndCheck).not.toHaveBeenCalled();
  });

  it('counts a row stored up to a few seconds before the job was created as its own (clock skew)', async () => {
    store.mockResolvedValue(alreadyStored(-2_000));
    await handleWebhookTx(retry);
    expect(alertJobs()).toHaveLength(2);
  });

  // Alchemy re-sends a webhook after BullMQ dropped the original job: the new
  // job gets the old job id but is a fresh job. Its first attempt fails, and
  // its rerun finds rows the original job stored long ago. Re-queueing their
  // alerts could fire a stale alert once the cooldown that skipped them ended.
  it('on a retry, queues no alert for a leg an earlier job stored long ago', async () => {
    store.mockRejectedValueOnce(new Error('connection terminated')).mockResolvedValueOnce(alreadyStored(-30 * 60_000));
    await expect(handleWebhookTx(firstAttempt)).rejects.toThrow();
    expect(alertJobs()).toEqual([]);

    store.mockResolvedValue(alreadyStored(-30 * 60_000));
    await handleWebhookTx(retry);
    expect(alertJobs()).toEqual([]);
  });

  it('on a first attempt, a leg that is already stored (a duplicate webhook) queues no alert', async () => {
    store.mockResolvedValue(alreadyStored(1_000));
    await handleWebhookTx(firstAttempt);
    expect(alertJobs()).toEqual([]);
  });

  it('counts an outbound send toward the rate limit once, on its first insert only', async () => {
    processTx.mockResolvedValue([ethLeg, leg({ direction: 'in', tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' })]);
    store.mockResolvedValue(inserted());
    await handleWebhookTx(firstAttempt);
    expect(recordAndCheck).toHaveBeenCalledTimes(1); // the outbound leg, not the inbound one
    expect(recordAndCheck).toHaveBeenCalledWith(expect.anything(), WALLET);

    vi.mocked(recordAndCheck).mockClear();
    store.mockResolvedValue(alreadyStored(1_000));
    await handleWebhookTx(retry);
    expect(recordAndCheck).not.toHaveBeenCalled();
  });

  it('queues each alert with bounded exponential backoff', async () => {
    store.mockResolvedValue(inserted());
    await handleWebhookTx(firstAttempt);
    for (const job of alertJobs()) {
      expect(job.opts).toMatchObject({ attempts: 7, backoff: { type: 'exponential', delay: 5_000 } });
    }
  });

  it('drops a malformed job with a log line instead of retrying it', async () => {
    await expect(
      handleWebhookTx({ data: { ...webhookData, txHash: 'not-a-hash' }, attemptsStarted: 1, timestamp: JOB_CREATED }),
    ).resolves.toBeUndefined();
    expect(processTx).not.toHaveBeenCalled();
  });
});
