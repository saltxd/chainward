import { Worker, type Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { alertEvents, alertConfigs } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface DeliveryJobData {
  alertConfigId: number;
  alertType: string;
  severity: string;
  title: string;
  description: string | null;
  triggerValue: number | null;
  triggerTxHash: string | null;
  agent: {
    name: string | null;
    wallet: string;
    chain: string;
  };
  channels: string[];
  webhookUrl: string | null;
  slackWebhook: string | null;
  discordWebhook: string | null;
  timestamp: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export function createAlertDeliveryWorker() {
  const worker = new Worker<DeliveryJobData>(
    'alert-deliver',
    async (job: Job<DeliveryJobData>) => {
      await deliverAlert(job.data);
    },
    {
      connection: getRedis(),
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, alertType: job.data.alertType }, 'Alert delivery completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Alert delivery failed');
  });

  logger.info('Alert delivery worker started');
  return worker;
}

async function deliverAlert(data: DeliveryJobData) {
  const db = getDb();
  const channels = data.channels;
  const errors: string[] = [];
  const deliveredChannels: string[] = [];

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'webhook':
          if (data.webhookUrl) {
            await deliverWebhook(data, data.webhookUrl);
            deliveredChannels.push('webhook');
          }
          break;
        case 'slack':
          if (data.slackWebhook) {
            await deliverSlack(data, data.slackWebhook);
            deliveredChannels.push('slack');
          }
          break;
        case 'discord':
          if (data.discordWebhook) {
            await deliverDiscord(data, data.discordWebhook);
            deliveredChannels.push('discord');
          }
          break;
        default:
          logger.warn({ channel }, 'Unknown delivery channel');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${channel}: ${message}`);
      logger.error({ err, channel, alertConfigId: data.alertConfigId }, 'Delivery failed for channel');
    }
  }

  // Update the most recent alert event for this config
  const delivered = deliveredChannels.length > 0;
  const deliveryError = errors.length > 0 ? errors.join('; ') : null;

  // Find the matching alert event by config + timestamp
  const events = await db
    .select()
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.alertConfigId, data.alertConfigId),
        eq(alertEvents.alertType, data.alertType),
      ),
    )
    .orderBy(alertEvents.timestamp)
    .limit(1);

  if (events.length > 0) {
    const event = events[0]!;
    // Update using a raw condition on the composite key (timestamp + alertConfigId)
    await db
      .update(alertEvents)
      .set({
        delivered,
        deliveryChannel: deliveredChannels.join(',') || null,
        deliveryError,
      })
      .where(
        and(
          eq(alertEvents.alertConfigId, event.alertConfigId),
          eq(alertEvents.timestamp, event.timestamp),
        ),
      );
  }

  logger.info(
    {
      alertConfigId: data.alertConfigId,
      delivered: deliveredChannels,
      errors: errors.length > 0 ? errors : undefined,
    },
    'Alert delivery complete',
  );
}

/** Deliver via generic webhook (POST JSON) with retry */
async function deliverWebhook(data: DeliveryJobData, url: string) {
  const payload = buildPayload(data);

  await retryFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Deliver via Slack webhook using Block Kit format */
async function deliverSlack(data: DeliveryJobData, webhookUrl: string) {
  const severityEmoji =
    data.severity === 'critical' ? ':rotating_light:' :
    data.severity === 'warning' ? ':warning:' : ':information_source:';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} ${data.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Agent:*\n${data.agent.name ?? data.agent.wallet.slice(0, 10) + '...'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Chain:*\n${data.agent.chain}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${data.alertType}`,
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${data.severity}`,
          },
        ],
      },
      ...(data.description
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: data.description,
              },
            },
          ]
        : []),
      ...(data.triggerTxHash
        ? [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Tx: \`${data.triggerTxHash.slice(0, 20)}...\``,
                },
              ],
            },
          ]
        : []),
    ],
  };

  await retryFetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Deliver via Discord webhook using embed format */
async function deliverDiscord(data: DeliveryJobData, webhookUrl: string) {
  const color =
    data.severity === 'critical' ? 0xd32f2f :
    data.severity === 'warning' ? 0xf59e0b : 0x1b5e20;

  const payload = {
    embeds: [
      {
        title: data.title,
        description: data.description ?? undefined,
        color,
        fields: [
          {
            name: 'Agent',
            value: data.agent.name ?? data.agent.wallet.slice(0, 10) + '...',
            inline: true,
          },
          {
            name: 'Chain',
            value: data.agent.chain,
            inline: true,
          },
          {
            name: 'Type',
            value: data.alertType,
            inline: true,
          },
          ...(data.triggerValue !== null
            ? [
                {
                  name: 'Trigger Value',
                  value: String(data.triggerValue),
                  inline: true,
                },
              ]
            : []),
          ...(data.triggerTxHash
            ? [
                {
                  name: 'Transaction',
                  value: `\`${data.triggerTxHash.slice(0, 20)}...\``,
                  inline: false,
                },
              ]
            : []),
        ],
        timestamp: data.timestamp,
        footer: {
          text: 'ChainWard Alert',
        },
      },
    ],
  };

  await retryFetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Build the standard alert payload for webhook delivery */
function buildPayload(data: DeliveryJobData) {
  return {
    type: data.alertType,
    severity: data.severity,
    agent: {
      name: data.agent.name,
      wallet: data.agent.wallet,
      chain: data.agent.chain,
    },
    trigger: {
      value: data.triggerValue,
      unit: 'usd',
      threshold: null,
      tx_hash: data.triggerTxHash,
    },
    timestamp: data.timestamp,
    dashboard_url: `https://app.chainward.ai/agents`,
  };
}

/** Fetch with retry and exponential backoff */
async function retryFetch(url: string, options: RequestInit, attempt = 1): Promise<void> {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      throw err;
    }

    const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    logger.warn(
      { url, attempt, delay, err: err instanceof Error ? err.message : String(err) },
      'Delivery attempt failed, retrying',
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryFetch(url, options, attempt + 1);
  }
}
