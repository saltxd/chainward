import { Worker, Queue, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { transactions, agentRegistry } from '@agentguard/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { processWebhookTx } from '../processors/baseProcessor.js';
import { backfillAgent } from './backfill.js';

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
    address: string;
    decimals: number;
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

async function handleWebhookTx(job: Job<WebhookJobData>) {
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
  const alertQueue = new Queue('alert-evaluate', { connection: redis });

  for (const tx of processed) {
    try {
      await db.insert(transactions).values(tx).onConflictDoNothing();

      // Dispatch alert evaluation for this transaction
      await alertQueue.add('tx-alert', {
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
      });
    } catch (err) {
      logger.error({ err, txHash: tx.txHash }, 'Failed to insert transaction');
    }
  }

  await alertQueue.close();

  logger.info(
    { txHash: job.data.txHash, inserted: processed.length },
    'Processed webhook transaction',
  );
}

async function handleBackfill(job: Job<WebhookJobData>) {
  const { agentId, walletAddress, chain } = job.data;
  if (!agentId || !walletAddress || !chain) {
    logger.error({ jobData: job.data }, 'Invalid backfill job data');
    return;
  }

  await backfillAgent(walletAddress, chain);
}
