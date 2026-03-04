import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config.js';
import { getQueues } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const webhooks = new Hono();

/**
 * Alchemy Address Activity webhook handler.
 * Receives webhook payloads, verifies signature, and queues transactions for processing.
 */
webhooks.post('/alchemy', async (c) => {
  const env = getEnv();
  const signingKey = env.ALCHEMY_WEBHOOK_SIGNING_KEY;

  // Verify webhook signature (required — app won't start without signing key)
  const signature = c.req.header('x-alchemy-signature');
  if (!signature) {
    throw new AppError(401, 'MISSING_SIGNATURE', 'Missing webhook signature');
  }

  const rawBody = await c.req.text();
  const expectedSignature = createHmac('sha256', signingKey).update(rawBody).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
  }

  const body = JSON.parse(rawBody) as AlchemyWebhookPayload;
  await processWebhookPayload(body);

  return c.json({ success: true });
});

interface AlchemyWebhookPayload {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: AlchemyActivity[];
  };
}

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  blockNum: string;
  hash: string;
  value: number;
  asset: string;
  category: string; // 'external', 'internal', 'erc20', 'erc721', 'erc1155'
  rawContract?: {
    rawValue: string;
    address: string;
    decimals: number;
  };
  log?: {
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  };
}

async function processWebhookPayload(payload: AlchemyWebhookPayload) {
  const activities = payload.event?.activity;
  if (!activities || activities.length === 0) return;

  const queues = getQueues();

  for (const activity of activities) {
    await queues.baseTxProcess.add(
      'process-tx',
      {
        type: 'webhook',
        txHash: activity.hash,
        blockNumber: parseInt(activity.blockNum, 16),
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        value: activity.value,
        asset: activity.asset,
        category: activity.category,
        rawContract: activity.rawContract,
        network: payload.event.network,
      },
      {
        jobId: `tx-${activity.hash}-${activity.category}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  logger.info({ count: activities.length, webhookId: payload.webhookId }, 'Queued webhook activities');
}

export { webhooks };
