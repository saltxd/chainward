import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { getWebhookProvider } from '../providers/index.js';
import { getQueues } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import type { NormalizedActivity } from '@chainward/common';

const webhooks = new Hono();

webhooks.post('/alchemy', async (c) => {
  const provider = getWebhookProvider();

  const signature = c.req.header('x-alchemy-signature');
  if (!signature) {
    throw new AppError(401, 'MISSING_SIGNATURE', 'Missing webhook signature');
  }

  const rawBody = await c.req.text();
  if (!provider.verifySignature(rawBody, signature)) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
  }

  const activities = provider.parsePayload(rawBody);
  if (activities.length === 0) {
    return c.json({ success: true });
  }

  const queues = getQueues();
  for (const [index, activity] of activities.entries()) {
    await queues.baseTxProcess.add(
      'process-tx',
      {
        type: 'webhook',
        txHash: activity.txHash,
        blockNumber: activity.blockNumber,
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        value: activity.value,
        asset: activity.asset,
        category: activity.category,
        rawContract: activity.rawContract,
        network: activity.network,
      },
      {
        jobId: buildWebhookActivityJobId(activity, index),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  logger.info({ count: activities.length }, 'Queued webhook activities');
  return c.json({ success: true });
});

export { webhooks };

function buildWebhookActivityJobId(activity: NormalizedActivity, index: number): string {
  const fingerprint = createHash('sha1')
    .update(
      JSON.stringify({
        txHash: activity.txHash,
        blockNumber: activity.blockNumber,
        category: activity.category,
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        value: activity.value,
        asset: activity.asset,
        rawContractAddress: activity.rawContract?.address ?? null,
        rawContractValue: activity.rawContract?.rawValue ?? null,
        index,
      }),
    )
    .digest('hex')
    .slice(0, 16);

  return `tx-${activity.txHash}-${fingerprint}`;
}
