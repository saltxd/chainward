import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── Background ───────────────────────────────────────────────────────────────
//
// Alchemy auto-deactivates webhooks that exceed an internal error threshold
// (deactivation_reason = TOO_MANY_ERRORS). When that happens, transactions
// silently stop flowing into our indexer until someone notices.
//
// This worker polls Alchemy's webhook status and:
//   1. If the webhook is deactivated → PATCH it back to active.
//   2. Either way → log + (optionally) alert via Discord.
//   3. As a secondary signal: if the latest tx in the DB is older than a
//      threshold while the webhook reports active, fire a "stalled" alert
//      so silent failures of a different kind don't slip through either.
//
// Set ALCHEMY_AUTH_TOKEN, ALCHEMY_WEBHOOK_ID, and (optional)
// OPS_DISCORD_WEBHOOK in the indexer env to enable.

const ALCHEMY_API = 'https://dashboard.alchemy.com/api';
const STALE_TX_MINUTES = 30;

interface AlchemyWebhook {
  id: string;
  webhook_url: string;
  is_active: boolean;
  deactivation_reason?: string | null;
}

async function fetchTeamWebhooks(authToken: string): Promise<AlchemyWebhook[]> {
  const res = await fetch(`${ALCHEMY_API}/team-webhooks`, {
    headers: { 'X-Alchemy-Token': authToken },
  });
  if (!res.ok) {
    throw new Error(`Alchemy GET /team-webhooks failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: AlchemyWebhook[] };
  return json.data;
}

async function reactivateWebhook(authToken: string, webhookId: string): Promise<void> {
  const res = await fetch(`${ALCHEMY_API}/update-webhook`, {
    method: 'PUT',
    headers: {
      'X-Alchemy-Token': authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ webhook_id: webhookId, is_active: true }),
  });
  if (!res.ok) {
    throw new Error(`Alchemy PUT /update-webhook failed: ${res.status} ${await res.text()}`);
  }
}

async function notifyDiscord(webhookUrl: string, content: string): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, body: await res.text() },
        'webhookHealth: Discord notify failed',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'webhookHealth: Discord notify threw');
  }
}

async function getMinutesSinceLatestTx(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX(timestamp))) / 60 AS minutes_since
    FROM transactions
  `);
  const value = (rows as unknown as Array<{ minutes_since: string | null }>)[0]?.minutes_since;
  return value == null ? null : parseFloat(String(value));
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createWebhookHealthWorker() {
  return new Worker(
    'webhook-health',
    async (_job: Job) => {
      const authToken = process.env.ALCHEMY_AUTH_TOKEN;
      const webhookId = process.env.ALCHEMY_WEBHOOK_ID;
      const discordUrl = process.env.OPS_DISCORD_WEBHOOK;

      if (!authToken || !webhookId) {
        logger.debug('webhookHealth: ALCHEMY_AUTH_TOKEN or ALCHEMY_WEBHOOK_ID not set, skipping');
        return { skipped: 'not_configured' };
      }

      let webhooks: AlchemyWebhook[];
      try {
        webhooks = await fetchTeamWebhooks(authToken);
      } catch (err) {
        logger.error({ err }, 'webhookHealth: failed to fetch team-webhooks');
        return { error: 'fetch_failed' };
      }

      const ours = webhooks.find((w) => w.id === webhookId);
      if (!ours) {
        logger.error({ webhookId }, 'webhookHealth: configured webhook id not found in team-webhooks');
        if (discordUrl) {
          await notifyDiscord(
            discordUrl,
            `🚨 **ChainWard webhook missing** — \`${webhookId}\` no longer present in Alchemy team-webhooks. Manual investigation required.`,
          );
        }
        return { error: 'webhook_missing' };
      }

      // Branch 1: webhook is deactivated → reactivate
      if (!ours.is_active) {
        const reason = ours.deactivation_reason ?? 'unknown';
        logger.warn(
          { webhookId, reason },
          'webhookHealth: webhook is inactive, attempting reactivation',
        );
        try {
          await reactivateWebhook(authToken, webhookId);
          logger.info({ webhookId, reason }, 'webhookHealth: reactivated webhook');
          if (discordUrl) {
            await notifyDiscord(
              discordUrl,
              `⚠️ **ChainWard Alchemy webhook auto-recovered** — \`${webhookId}\` was \`${reason}\`, reactivated. Watch for repeat deactivations; they signal a real handler issue.`,
            );
          }
          return { action: 'reactivated', reason };
        } catch (err) {
          logger.error({ err, webhookId }, 'webhookHealth: reactivation failed');
          if (discordUrl) {
            await notifyDiscord(
              discordUrl,
              `🚨 **ChainWard webhook reactivation FAILED** — \`${webhookId}\` (\`${reason}\`). Manual fix needed.`,
            );
          }
          return { error: 'reactivation_failed' };
        }
      }

      // Branch 2: webhook is active but txs are stale → alert (don't reactivate, since active)
      const minutesSince = await getMinutesSinceLatestTx();
      if (minutesSince != null && minutesSince > STALE_TX_MINUTES) {
        logger.warn(
          { minutesSince, threshold: STALE_TX_MINUTES },
          'webhookHealth: webhook active but tx ingestion stalled',
        );
        if (discordUrl) {
          await notifyDiscord(
            discordUrl,
            `⚠️ **ChainWard tx ingestion stalled** — Alchemy webhook is active but no transactions ingested for ${Math.round(minutesSince)} minutes (threshold ${STALE_TX_MINUTES}). Possible network issue, signing-key drift, or bug in the webhook handler.`,
          );
        }
        return { warning: 'stalled', minutesSince };
      }

      logger.debug({ minutesSince }, 'webhookHealth: ok');
      return { ok: true, minutesSince };
    },
    { connection: getRedis(), concurrency: 1 },
  );
}

// ─── Schedule setup ───────────────────────────────────────────────────────────

export async function setupWebhookHealthSchedule(redis: import('ioredis').default) {
  const queue = new Queue('webhook-health', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Every 5 minutes
  await queue.add(
    'webhook-health-check',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'webhook-health-check',
    },
  );

  logger.info('Webhook health schedule configured (every 5 minutes)');
  await queue.close();
}
