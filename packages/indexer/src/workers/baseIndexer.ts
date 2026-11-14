import { Worker, type Job } from 'bullmq';
import { createQueue } from '../lib/queue.js';
import { eq } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { processWebhookTx, type ProcessedTransaction } from '../processors/baseProcessor.js';
import { backfillAgent } from './backfill.js';
import { BACKFILL_WINDOW_DAYS, baseLookbackStart } from '../lib/baseWindow.js';
import { getBaseClient } from '../lib/viem.js';
import { alchemyBackfillAvailable, backfillWalletViaTransfers } from './transferBackfill.js';
import { isAddressPaused, isOutbound, recordAndCheck } from '../lib/rateLimiter.js';
import { insertTransactionIfNew } from '../lib/transactionStore.js';
import { alertJobId } from '../lib/alertJobId.js';

interface WebhookJobData {
  type: 'webhook' | 'backfill';
  txHash?: string;
  blockNumber?: number;
  fromAddress?: string;
  toAddress?: string;
  value?: number;
  asset?: string;
  category?: string;
  rawContract?: {
    rawValue: string;
    address?: string | null;
    decimals?: number | null;
  };
  network?: string;
  // Backfill fields
  agentId?: number;
  walletAddress?: string;
  chain?: string;
}

export function createBaseIndexerWorker() {
  const worker = new Worker<WebhookJobData>(
    'base-tx-process',
    async (job: Job<WebhookJobData>) => {
      if (job.data.type === 'backfill') {
        await handleBackfill(job);
        return;
      }

      await handleWebhookTx(job);
    },
    {
      connection: getRedis(),
      concurrency: 5,
      limiter: { max: 50, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, type: job.data.type }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  logger.info('Base indexer worker started');
  return worker;
}

/**
 * Retries for one leg's alert evaluation: about half a minute of backoff, enough
 * to ride out a Redis or Postgres blip without retrying forever.
 */
const ALERT_EVAL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
} as const;

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** A payload no retry can fix: dropped with a log line, like an invalid backfill job. */
function isWellFormedWebhook(data: WebhookJobData): boolean {
  return typeof data.txHash === 'string' && TX_HASH.test(data.txHash) && Number.isSafeInteger(data.blockNumber);
}

interface LegContext {
  db: ReturnType<typeof getDb>;
  redis: ReturnType<typeof getRedis>;
  alertQueue: ReturnType<typeof createQueue>;
  /** This job ran before (a BullMQ retry, or a stalled job picked up again). */
  rerun: boolean;
}

/**
 * Any error fails the job so BullMQ retries it, and the retry is safe to
 * repeat: each leg is stored at most once (insertTransactionIfNew), and its
 * alert job id is built from the leg's content, so queueing it again collapses
 * into the job already queued.
 */
export async function handleWebhookTx(job: Pick<Job<WebhookJobData>, 'data' | 'attemptsStarted'>) {
  if (!isWellFormedWebhook(job.data)) {
    logger.error({ jobData: job.data }, 'Invalid webhook job data, dropping');
    return;
  }

  const db = getDb();

  // Get all monitored addresses to check involvement
  const agents = await db
    .select({ walletAddress: agentRegistry.walletAddress })
    .from(agentRegistry)
    .where(eq(agentRegistry.chain, 'base'));

  const monitoredAddresses = new Set(agents.map((a) => a.walletAddress));

  const processed = await processWebhookTx(
    job.data as Parameters<typeof processWebhookTx>[0],
    monitoredAddresses,
  );

  if (processed.length === 0) return;

  // Insert transactions and trigger alert evaluation
  const redis = getRedis();
  const alertQueue = createQueue('alert-evaluate', redis);
  const ctx: LegContext = { db, redis, alertQueue, rerun: job.attemptsStarted > 1 };
  let insertedCount = 0;
  const failures: unknown[] = [];

  try {
    for (const tx of processed) {
      try {
        if (await storeLeg(tx, ctx)) insertedCount++;
      } catch (err) {
        failures.push(err);
        logger.error({ err, txHash: tx.txHash, walletAddress: tx.walletAddress }, 'Failed to store transaction leg');
      }
    }
  } finally {
    await alertQueue.close();
  }

  logger.info(
    { txHash: job.data.txHash, inserted: insertedCount, processed: processed.length, failed: failures.length },
    'Processed webhook transaction',
  );

  // The other legs are handled; the retry redoes only what is missing.
  if (failures.length > 0) throw failures[0];
}

/** Store one leg and queue its alert evaluation. Returns whether a row was inserted. */
async function storeLeg(tx: ProcessedTransaction, { db, redis, alertQueue, rerun }: LegContext): Promise<boolean> {
  // A paused address only sheds INBOUND transfers. Outbound txs are always
  // inserted and evaluated — otherwise anyone could pause a wallet and
  // drain it unobserved (see lib/rateLimiter.ts).
  const outbound = isOutbound(tx.direction);
  if (!outbound && (await isAddressPaused(redis, tx.walletAddress))) {
    logger.debug(
      { address: tx.walletAddress, txHash: tx.txHash },
      'Skipping inbound tx for rate-limited address',
    );
    return false;
  }

  const inserted = await insertTransactionIfNew(db, tx);
  // On a first run a stored leg is a duplicate webhook: its alert was queued
  // when it was stored. On a rerun it may be this job's own row, stored just
  // before the attempt failed, so its alert is queued again (same job id).
  if (!inserted && !rerun) {
    logger.debug(
      { walletAddress: tx.walletAddress, txHash: tx.txHash },
      'Skipping duplicate transaction insert',
    );
    return false;
  }

  // Dispatch alert evaluation for this leg, only once its row is stored. The
  // jobId is built from the leg's content, so a second leg of the same
  // transaction (ETH out, token in) is evaluated on its own amount instead of
  // being dropped as a duplicate of the first.
  await alertQueue.add(
    'tx-alert',
    {
      type: 'tx-triggered',
      walletAddress: tx.walletAddress,
      chain: tx.chain,
      txHash: tx.txHash,
      amountUsd: tx.amountUsd,
      gasCostUsd: tx.gasCostUsd,
      status: tx.status,
      contractAddress: tx.contractAddress ?? null,
      direction: tx.direction,
      timestamp: tx.timestamp.toISOString(),
    },
    { jobId: alertJobId(tx), ...ALERT_EVAL_JOB_OPTIONS },
  );

  // Only the wallet's own sends count toward the rate limit, once per stored row
  const justPaused = inserted && outbound && (await recordAndCheck(redis, tx.walletAddress));
  if (justPaused) {
    // Send rate-limit alert to the user via the alert delivery queue
    const alertDeliveryQueue = createQueue('alert-deliver', redis);
    try {
      await alertDeliveryQueue.add('rate-limit-warning', {
        type: 'rate-limit',
        walletAddress: tx.walletAddress,
        chain: tx.chain,
      });
    } finally {
      await alertDeliveryQueue.close();
    }
  }

  return inserted;
}

async function handleBackfill(job: Job<WebhookJobData>) {
  const { agentId, walletAddress, chain } = job.data;
  if (!agentId || !walletAddress || !chain) {
    logger.error({ jobData: job.data }, 'Invalid backfill job data');
    return;
  }

  // The old path is one eth_getLogs over ~30 days of blocks; the own node is
  // pruned and every fallback RPC refuses the range (HTTP 413), so new agents
  // got no history. Alchemy's transfer index has no range cap: same 30-day
  // window, at most 1,000 transfers per direction like the old maxCount.
  if (chain === 'base' && alchemyBackfillAvailable()) {
    const currentBlock = await getBaseClient().getBlockNumber();
    const inserted = await backfillWalletViaTransfers(walletAddress, {
      fromBlock: baseLookbackStart(currentBlock, BACKFILL_WINDOW_DAYS),
      maxPages: 10,
    });
    logger.info({ walletAddress, inserted }, 'Registration backfill via alchemy_getAssetTransfers');
    return;
  }
  await backfillAgent(walletAddress, chain);
}

