import { Worker, type Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { lookup } from 'node:dns/promises';
import { alertEvents, alertConfigs, agentRegistry } from '@chainward/db';
import { getExplorerTxUrl, type SupportedChain } from '@chainward/common';
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
  eventTimestamp: string;
  agent: {
    name: string | null;
    wallet: string;
    chain: string;
  };
  channels: string[];
  webhookUrl: string | null;
  telegramChatId: string | null;
  discordWebhook: string | null;
  timestamp: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface RateLimitJobData {
  type: 'rate-limit';
  walletAddress: string;
  chain: string;
}

export function createAlertDeliveryWorker() {
  const worker = new Worker<DeliveryJobData | RateLimitJobData>(
    'alert-deliver',
    async (job: Job<DeliveryJobData | RateLimitJobData>) => {
      if ('type' in job.data && job.data.type === 'rate-limit') {
        await handleRateLimitAlert(job.data as RateLimitJobData);
        return;
      }
      await deliverAlert(job.data as DeliveryJobData);
    },
    {
      connection: getRedis(),
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Alert delivery completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Alert delivery failed');
  });

  logger.info('Alert delivery worker started');
  return worker;
}

async function handleRateLimitAlert(data: RateLimitJobData) {
  const db = getDb();

  // Find the agent and its owner's alert configs to get delivery channels
  const [agent] = await db
    .select()
    .from(agentRegistry)
    .where(eq(agentRegistry.walletAddress, data.walletAddress))
    .limit(1);

  if (!agent) {
    logger.warn({ address: data.walletAddress }, 'Rate-limit alert: agent not found');
    return;
  }

  // Find any alert config for this user to get their delivery channels
  const configs = await db
    .select()
    .from(alertConfigs)
    .where(eq(alertConfigs.userId, agent.userId))
    .limit(1);

  const agentLabel = agent.agentName ?? `${data.walletAddress.slice(0, 8)}...`;
  const message = `⚠️ High transaction volume detected on ${agentLabel}. Indexing paused for 5 minutes to protect resources. This address is generating >10 transactions per minute.`;

  logger.info({ address: data.walletAddress, agent: agentLabel }, 'Sending rate-limit alert');

  // If the user has any alert configs, use the first one's channels
  const config = configs[0];
  if (config) {
    if (config.discordWebhook) {
      try {
        await fetch(config.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: '⚠️ Indexing Paused — High Volume',
              description: `**${agentLabel}** is generating >10 transactions/minute. Indexing paused for 5 minutes.`,
              color: 0xfbbf24, // amber
              footer: { text: 'ChainWard Rate Limiter' },
              timestamp: new Date().toISOString(),
            }],
          }),
        });
      } catch (err) {
        logger.error({ err }, 'Failed to send rate-limit Discord alert');
      }
    }
    if (config.telegramChatId) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.telegramChatId,
              text: message,
              parse_mode: 'HTML',
            }),
          });
        } catch (err) {
          logger.error({ err }, 'Failed to send rate-limit Telegram alert');
        }
      }
    }
  }
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
        case 'telegram':
          if (data.telegramChatId) {
            await deliverTelegram(data, data.telegramChatId);
            deliveredChannels.push('telegram');
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

  // Update the exact alert event row that was queued for delivery.
  const delivered = deliveredChannels.length > 0;
  const deliveryError = errors.length > 0 ? errors.join('; ') : null;

  await db
    .update(alertEvents)
    .set({
      delivered,
      deliveryChannel: deliveredChannels.join(',') || null,
      deliveryError,
    })
    .where(
      and(
        eq(alertEvents.alertConfigId, data.alertConfigId),
        eq(alertEvents.timestamp, new Date(data.eventTimestamp)),
      ),
    );

  logger.info(
    {
      alertConfigId: data.alertConfigId,
      eventTimestamp: data.eventTimestamp,
      delivered: deliveredChannels,
      errors: errors.length > 0 ? errors : undefined,
    },
    'Alert delivery complete',
  );

  // If ALL channels failed, throw so BullMQ retries the job
  if (deliveredChannels.length === 0 && errors.length > 0) {
    throw new Error(`All delivery channels failed: ${errors.join('; ')}`);
  }
}

/** Deliver via generic webhook (POST JSON) with retry */
async function deliverWebhook(data: DeliveryJobData, url: string) {
  await validateDeliveryUrl(url);
  const payload = buildPayload(data);

  await retryFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Deliver via Telegram Bot API using HTML parse mode */
async function deliverTelegram(data: DeliveryJobData, chatId: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }

  const severityEmoji =
    data.severity === 'critical' ? '\u{1F6A8}' :
    data.severity === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F';

  const agentDisplay = data.agent.name ?? `${data.agent.wallet.slice(0, 10)}...`;
  const txLine = data.triggerTxHash
    ? `\n<b>Tx:</b> <a href="${getExplorerTxUrl(data.agent.chain as SupportedChain, data.triggerTxHash)}">${data.triggerTxHash.slice(0, 16)}...</a>`
    : '';

  const text = [
    `${severityEmoji} <b>${escapeHtml(data.title)}</b>`,
    '',
    `<b>Agent:</b> ${escapeHtml(agentDisplay)}`,
    `<b>Chain:</b> ${data.agent.chain}`,
    `<b>Type:</b> ${data.alertType}`,
    ...(data.triggerValue !== null ? [`<b>${triggerFieldName(data.alertType)}:</b> ${formatTriggerValue(data.alertType, data.triggerValue)}`] : []),
    ...(data.description ? ['', escapeHtml(data.description)] : []),
    txLine,
    '',
    `<a href="https://chainward.ai/alerts">View in ChainWard</a>`,
  ].join('\n');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await retryFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Deliver via Discord webhook using embed format */
async function deliverDiscord(data: DeliveryJobData, webhookUrl: string) {
  await validateDeliveryUrl(webhookUrl);
  const color =
    data.severity === 'critical' ? 0xd32f2f :
    data.severity === 'warning' ? 0xf59e0b : 0x4ade80;

  const txField = data.triggerTxHash
    ? (() => {
        const txUrl = getExplorerTxUrl(data.agent.chain as SupportedChain, data.triggerTxHash);
        return [{
          name: 'Transaction',
          value: `[\`${data.triggerTxHash.slice(0, 16)}...\`](${txUrl})`,
          inline: false,
        }];
      })()
    : [];

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
                  name: triggerFieldName(data.alertType),
                  value: formatTriggerValue(data.alertType, data.triggerValue),
                  inline: true,
                },
              ]
            : []),
          ...txField,
          {
            name: '\u200B',
            value: '[View in ChainWard](https://chainward.ai/alerts)',
            inline: false,
          },
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

/** Format trigger value based on alert type */
function formatTriggerValue(alertType: string, value: number): string {
  if (alertType === 'balance_drop') return `${value.toFixed(1)}%`;
  if (alertType === 'inactivity') return `${value}h`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Field label override per alert type (default: "Value") */
function triggerFieldName(alertType: string): string {
  if (alertType === 'idle_balance') return 'Balance';
  return 'Value';
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
    dashboard_url: `https://chainward.ai/agents`,
  };
}

/** Known-safe webhook domains (skip DNS resolution check) */
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'api.telegram.org',
  'discord.com',
  'discordapp.com',
]);

/** Private/reserved IPv4 ranges */
const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 → 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  // IPv6 loopback and private ranges
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return true;
  }
  // Check IPv4 private ranges
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const num = ipToNum(ip);
    return PRIVATE_RANGES.some((r) => num >= ipToNum(r.start) && num <= ipToNum(r.end));
  }
  return false;
}

/**
 * Validate a webhook URL at delivery time by resolving DNS and checking
 * the resolved IP isn't private. Prevents SSRF via DNS rebinding.
 */
async function validateDeliveryUrl(urlStr: string): Promise<void> {
  const url = new URL(urlStr);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    throw new Error('Webhook URL cannot point to localhost');
  }

  // Skip DNS check for known-safe hosts
  if (ALLOWED_WEBHOOK_HOSTS.has(hostname)) return;

  // Skip DNS check for raw IPs but validate they're not private
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Webhook URL cannot point to private IP addresses');
    }
    return;
  }

  const result = await lookup(hostname);
  if (isPrivateIp(result.address)) {
    throw new Error('Webhook URL resolves to a private IP address');
  }
}

/** Fetch with retry and exponential backoff */
async function retryFetch(url: string, options: RequestInit, attempt = 1): Promise<void> {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
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
