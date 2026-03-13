import { Worker, Queue, type Job } from 'bullmq';
import { eq, and, desc, sql, gt, lt, or } from 'drizzle-orm';
import { alertConfigs, alertEvents, transactions, balanceSnapshots, agentRegistry } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface TxAlertJobData {
  type: 'tx-triggered';
  walletAddress: string;
  chain: string;
  txHash: string;
  amountUsd: string | null;
  gasCostUsd: string | null;
  status: string;
  contractAddress: string | null;
  direction: string;
  timestamp: string;
}

interface ScheduleAlertJobData {
  type: 'scheduled';
}

export type AlertJobData = TxAlertJobData | ScheduleAlertJobData;

interface AlertTriggerResult {
  triggered: boolean;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  triggerValue: number | null;
  triggerTxHash: string | null;
}

interface ClaimedAlertEvent {
  eventTimestamp: string;
}

export function createAlertEvaluatorWorker() {
  const worker = new Worker<AlertJobData>(
    'alert-evaluate',
    async (job: Job<AlertJobData>) => {
      if (job.data.type === 'scheduled') {
        await evaluateScheduledAlerts();
        return;
      }

      await evaluateTxAlerts(job.data);
    },
    {
      connection: getRedis(),
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, type: job.data.type }, 'Alert evaluation completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Alert evaluation failed');
  });

  logger.info('Alert evaluator worker started');
  return worker;
}

/** Set up repeatable scheduled alert evaluation (every 5 minutes) */
export async function setupAlertSchedule(redis: import('ioredis').default) {
  const queue = new Queue('alert-evaluate', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    'scheduled-eval',
    { type: 'scheduled' },
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'alert-scheduled-repeatable',
    },
  );

  logger.info('Alert schedule evaluation set up (every 5 minutes)');
  await queue.close();
}

/**
 * Transaction-triggered alert evaluation.
 * Handles: large_transfer, gas_spike, failed_tx, new_contract
 */
async function evaluateTxAlerts(data: TxAlertJobData) {
  const db = getDb();

  // Load active alert configs for this wallet
  const configs = await db
    .select()
    .from(alertConfigs)
    .where(
      and(
        eq(alertConfigs.walletAddress, data.walletAddress),
        eq(alertConfigs.chain, data.chain),
        eq(alertConfigs.enabled, true),
      ),
    );

  if (configs.length === 0) return;

  const txAlertTypes = ['large_transfer', 'gas_spike', 'failed_tx', 'new_contract'];
  const relevantConfigs = configs.filter((c) => txAlertTypes.includes(c.alertType));

  for (const config of relevantConfigs) {
    try {
      // Check cooldown
      if (config.lastTriggered) {
        const cooldownMs = parseCooldown(config.cooldown);
        const elapsed = Date.now() - new Date(config.lastTriggered).getTime();
        if (elapsed < cooldownMs) {
          logger.debug(
            { alertId: config.id, alertType: config.alertType },
            'Alert in cooldown, skipping',
          );
          continue;
        }
      }

      const result = await evaluateCondition(config, data);

      if (result.triggered) {
        // Deduplicate: skip if this exact (alertConfig, txHash) already fired
        if (result.triggerTxHash) {
          const existing = await db
            .select({ alertConfigId: alertEvents.alertConfigId })
            .from(alertEvents)
            .where(
              and(
                eq(alertEvents.alertConfigId, config.id),
                eq(alertEvents.triggerTxHash, result.triggerTxHash),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            logger.debug(
              { txHash: result.triggerTxHash, alertId: config.id },
              'Duplicate alert prevented — already fired for this tx',
            );
            continue;
          }
        }

        await fireAlert(config, result);
      }
    } catch (err) {
      logger.error(
        { err, alertId: config.id, alertType: config.alertType },
        'Error evaluating alert condition',
      );
    }
  }
}

/**
 * Schedule-triggered alert evaluation.
 * Handles: balance_drop, inactivity
 */
async function evaluateScheduledAlerts() {
  const db = getDb();

  const configs = await db
    .select()
    .from(alertConfigs)
    .where(
      and(
        eq(alertConfigs.enabled, true),
        or(
          eq(alertConfigs.alertType, 'balance_drop'),
          eq(alertConfigs.alertType, 'inactivity'),
          eq(alertConfigs.alertType, 'idle_balance'),
        ),
      ),
    );

  logger.info({ count: configs.length }, 'Evaluating scheduled alerts');

  for (const config of configs) {
    try {
      // Check cooldown
      if (config.lastTriggered) {
        const cooldownMs = parseCooldown(config.cooldown);
        const elapsed = Date.now() - new Date(config.lastTriggered).getTime();
        if (elapsed < cooldownMs) continue;
      }

      let result: AlertTriggerResult;

      if (config.alertType === 'balance_drop') {
        result = await evaluateBalanceDrop(config);
      } else if (config.alertType === 'inactivity') {
        result = await evaluateInactivity(config);
      } else if (config.alertType === 'idle_balance') {
        result = await evaluateIdleBalance(config);
      } else {
        continue;
      }

      if (result.triggered) {
        await fireAlert(config, result);
      }
    } catch (err) {
      logger.error(
        { err, alertId: config.id, alertType: config.alertType },
        'Error evaluating scheduled alert',
      );
    }
  }
}

/** Evaluate a transaction-triggered alert condition */
async function evaluateCondition(
  config: typeof alertConfigs.$inferSelect,
  data: TxAlertJobData,
): Promise<AlertTriggerResult> {
  const threshold = config.thresholdValue ? parseFloat(config.thresholdValue) : 0;

  switch (config.alertType) {
    case 'large_transfer': {
      const amountUsd = data.amountUsd ? parseFloat(data.amountUsd) : 0;
      const triggered = amountUsd >= threshold;
      return {
        triggered,
        severity: amountUsd >= threshold * 5 ? 'critical' : 'warning',
        title: `Large transfer detected: $${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        description: `Transaction ${data.txHash.slice(0, 10)}... moved $${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${threshold > 0 ? ` (threshold: $${threshold.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}`,
        triggerValue: amountUsd,
        triggerTxHash: data.txHash,
      };
    }

    case 'gas_spike': {
      const gasCost = data.gasCostUsd ? parseFloat(data.gasCostUsd) : 0;
      const triggered = gasCost >= threshold;
      return {
        triggered,
        severity: gasCost >= threshold * 3 ? 'critical' : 'warning',
        title: `Gas spike: $${gasCost.toFixed(4)}`,
        description: `Transaction ${data.txHash.slice(0, 10)}... cost $${gasCost.toFixed(4)} in gas${threshold > 0 ? ` (threshold: $${threshold.toFixed(2)})` : ''}`,
        triggerValue: gasCost,
        triggerTxHash: data.txHash,
      };
    }

    case 'failed_tx': {
      const triggered = data.status === 'failed';
      return {
        triggered,
        severity: 'critical',
        title: `Failed transaction detected`,
        description: `Transaction ${data.txHash.slice(0, 10)}... reverted on ${data.chain}`,
        triggerValue: null,
        triggerTxHash: data.txHash,
      };
    }

    case 'new_contract': {
      if (!data.contractAddress) {
        return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
      }

      const db = getDb();
      // Check if this wallet has ever interacted with this contract before
      const existing = await db
        .select({ txHash: transactions.txHash })
        .from(transactions)
        .where(
          and(
            eq(transactions.walletAddress, data.walletAddress),
            eq(transactions.contractAddress, data.contractAddress),
            lt(transactions.timestamp, new Date(data.timestamp)),
          ),
        )
        .limit(1);

      const triggered = existing.length === 0;
      return {
        triggered,
        severity: 'warning',
        title: `New contract interaction`,
        description: `Wallet interacted with new contract ${data.contractAddress.slice(0, 10)}... via tx ${data.txHash.slice(0, 10)}...`,
        triggerValue: null,
        triggerTxHash: data.txHash,
      };
    }

    default:
      return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
  }
}

/** Evaluate balance_drop alert */
async function evaluateBalanceDrop(
  config: typeof alertConfigs.$inferSelect,
): Promise<AlertTriggerResult> {
  const db = getDb();
  const threshold = config.thresholdValue ? parseFloat(config.thresholdValue) : 20; // default 20%
  const lookbackMs = parseLookback(config.lookbackWindow ?? '1 hour');
  const lookbackDate = new Date(Date.now() - lookbackMs);

  // Get the earliest and latest balance snapshots within the lookback window
  const snapshots = await db
    .select({
      balanceUsd: balanceSnapshots.balanceUsd,
      timestamp: balanceSnapshots.timestamp,
      tokenSymbol: balanceSnapshots.tokenSymbol,
    })
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.walletAddress, config.walletAddress),
        eq(balanceSnapshots.chain, config.chain),
        gt(balanceSnapshots.timestamp, lookbackDate),
      ),
    )
    .orderBy(balanceSnapshots.timestamp);

  if (snapshots.length < 2) {
    return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
  }

  // Sum total USD across all tokens at earliest and latest snapshots
  const earliestTime = snapshots[0]!.timestamp;
  const latestTime = snapshots[snapshots.length - 1]!.timestamp;

  let earliestTotal = 0;
  let latestTotal = 0;

  for (const s of snapshots) {
    const val = s.balanceUsd ? parseFloat(s.balanceUsd) : 0;
    if (s.timestamp.getTime() === earliestTime.getTime()) {
      earliestTotal += val;
    }
    if (s.timestamp.getTime() === latestTime.getTime()) {
      latestTotal += val;
    }
  }

  if (earliestTotal === 0) {
    return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
  }

  const dropPercent = ((earliestTotal - latestTotal) / earliestTotal) * 100;
  const triggered = dropPercent >= threshold;

  return {
    triggered,
    severity: dropPercent >= threshold * 2 ? 'critical' : 'warning',
    title: `Balance dropped ${dropPercent.toFixed(1)}%`,
    description: `Portfolio value dropped from $${earliestTotal.toFixed(2)} to $${latestTotal.toFixed(2)} (${dropPercent.toFixed(1)}% drop, threshold: ${threshold}%)`,
    triggerValue: dropPercent,
    triggerTxHash: null,
  };
}

/** Evaluate inactivity alert */
async function evaluateInactivity(
  config: typeof alertConfigs.$inferSelect,
): Promise<AlertTriggerResult> {
  const db = getDb();
  const lookbackMs = parseLookback(config.lookbackWindow ?? '24 hours');
  const cutoff = new Date(Date.now() - lookbackMs);

  // Check for any transactions since the cutoff
  const recentTxs = await db
    .select({ txHash: transactions.txHash })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletAddress, config.walletAddress),
        eq(transactions.chain, config.chain),
        gt(transactions.timestamp, cutoff),
      ),
    )
    .limit(1);

  const triggered = recentTxs.length === 0;

  // Get the last transaction time for description
  const lastTx = await db
    .select({ timestamp: transactions.timestamp })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletAddress, config.walletAddress),
        eq(transactions.chain, config.chain),
      ),
    )
    .orderBy(desc(transactions.timestamp))
    .limit(1);

  const lastTxTime = lastTx[0]?.timestamp;
  const hoursInactive = lastTxTime
    ? Math.round((Date.now() - lastTxTime.getTime()) / (1000 * 60 * 60))
    : null;

  return {
    triggered,
    severity: 'warning',
    title: `Agent inactive for ${hoursInactive ?? 'unknown'} hours`,
    description: lastTxTime
      ? `No transactions since ${lastTxTime.toISOString()} (${hoursInactive}h ago, threshold: ${lookbackMs / (1000 * 60 * 60)}h)`
      : `No transactions found for wallet ${config.walletAddress.slice(0, 10)}...`,
    triggerValue: hoursInactive,
    triggerTxHash: null,
  };
}

/**
 * Evaluate idle_balance alert.
 *
 * Fires when:
 *  1. Current balance (sum of latest snapshots) > minBalance (thresholdValue, USD)
 *  2. No *outgoing* transactions in the last idleDuration (lookbackWindow)
 *
 * The thresholdValue stores the minimum balance in USD.
 * The lookbackWindow stores the idle duration (e.g. "24 hours").
 */
async function evaluateIdleBalance(
  config: typeof alertConfigs.$inferSelect,
): Promise<AlertTriggerResult> {
  const db = getDb();
  const minBalanceUsd = config.thresholdValue ? parseFloat(config.thresholdValue) : 50;
  const idleDurationMs = parseLookback(config.lookbackWindow ?? '24 hours');
  const idleCutoff = new Date(Date.now() - idleDurationMs);
  const idleHours = idleDurationMs / (1000 * 60 * 60);

  // 1. Get the most recent balance snapshot per token for this wallet
  //    We group manually — take all snapshots, dedupe by tokenSymbol keeping latest
  const allSnapshots = await db
    .select({
      tokenSymbol: balanceSnapshots.tokenSymbol,
      balanceUsd: balanceSnapshots.balanceUsd,
      timestamp: balanceSnapshots.timestamp,
    })
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.walletAddress, config.walletAddress),
        eq(balanceSnapshots.chain, config.chain),
      ),
    )
    .orderBy(desc(balanceSnapshots.timestamp))
    .limit(20); // recent snapshots across all tokens

  // Dedupe: keep latest per tokenSymbol
  const latestByToken = new Map<string, { balanceUsd: string | null; tokenSymbol: string | null }>();
  for (const s of allSnapshots) {
    const key = s.tokenSymbol ?? '__native__';
    if (!latestByToken.has(key)) {
      latestByToken.set(key, s);
    }
  }

  let totalBalanceUsd = 0;
  const tokenBalances: string[] = [];
  for (const [, snap] of latestByToken) {
    const val = snap.balanceUsd ? parseFloat(snap.balanceUsd) : 0;
    if (val > 0) {
      totalBalanceUsd += val;
      tokenBalances.push(`${snap.tokenSymbol ?? 'ETH'}: $${val.toFixed(2)}`);
    }
  }

  // If balance is below threshold, don't fire
  if (totalBalanceUsd < minBalanceUsd) {
    return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
  }

  // 2. Check for any outgoing transactions since the idle cutoff
  const recentOutgoing = await db
    .select({ txHash: transactions.txHash })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletAddress, config.walletAddress),
        eq(transactions.chain, config.chain),
        eq(transactions.direction, 'out'),
        gt(transactions.timestamp, idleCutoff),
      ),
    )
    .limit(1);

  // If there are recent outgoing txs, the balance isn't "idle"
  if (recentOutgoing.length > 0) {
    return { triggered: false, severity: 'info', title: '', description: '', triggerValue: null, triggerTxHash: null };
  }

  // 3. Get last outgoing tx time for the description
  const lastOutgoing = await db
    .select({ timestamp: transactions.timestamp })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletAddress, config.walletAddress),
        eq(transactions.chain, config.chain),
        eq(transactions.direction, 'out'),
      ),
    )
    .orderBy(desc(transactions.timestamp))
    .limit(1);

  const lastOutTime = lastOutgoing[0]?.timestamp;
  const hoursIdle = lastOutTime
    ? Math.round((Date.now() - lastOutTime.getTime()) / (1000 * 60 * 60))
    : null;

  return {
    triggered: true,
    severity: totalBalanceUsd >= minBalanceUsd * 5 ? 'critical' : 'warning',
    title: `Idle balance: $${totalBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sitting unused`,
    description: hoursIdle !== null
      ? `$${totalBalanceUsd.toFixed(2)} idle for ${hoursIdle}h (threshold: $${minBalanceUsd.toFixed(2)}, ${idleHours}h). Balances: ${tokenBalances.join(', ')}`
      : `$${totalBalanceUsd.toFixed(2)} with no outgoing transactions. Balances: ${tokenBalances.join(', ')}`,
    triggerValue: totalBalanceUsd,
    triggerTxHash: null,
  };
}

/** Fire an alert: create event record and push to delivery queue */
async function fireAlert(
  config: typeof alertConfigs.$inferSelect,
  result: AlertTriggerResult,
) {
  const db = getDb();
  const redis = getRedis();
  const claimed = await claimAlertEvent(config, result);
  if (!claimed) {
    logger.debug(
      {
        alertId: config.id,
        alertType: config.alertType,
        triggerTxHash: result.triggerTxHash ?? undefined,
      },
      'Alert skipped after atomic dedupe/cooldown check',
    );
    return;
  }

  // Get agent name for the delivery payload
  const agents = await db
    .select({ agentName: agentRegistry.agentName })
    .from(agentRegistry)
    .where(
      and(
        eq(agentRegistry.walletAddress, config.walletAddress),
        eq(agentRegistry.chain, config.chain),
      ),
    )
    .limit(1);

  // Push to alert-deliver queue
  const deliverQueue = new Queue('alert-deliver', { connection: redis });
  await deliverQueue.add('deliver', {
    alertConfigId: config.id,
    alertType: config.alertType,
    severity: result.severity,
    title: result.title,
    description: result.description,
    triggerValue: result.triggerValue,
    triggerTxHash: result.triggerTxHash,
    eventTimestamp: claimed.eventTimestamp,
    agent: {
      name: agents[0]?.agentName ?? null,
      wallet: config.walletAddress,
      chain: config.chain,
    },
    channels: config.channels,
    webhookUrl: config.webhookUrl,
    telegramChatId: config.telegramChatId,
    discordWebhook: config.discordWebhook,
    timestamp: claimed.eventTimestamp,
  });
  await deliverQueue.close();

  logger.info(
    {
      alertId: config.id,
      alertType: config.alertType,
      severity: result.severity,
      title: result.title,
      eventTimestamp: claimed.eventTimestamp,
    },
    'Alert fired',
  );
}

async function claimAlertEvent(
  config: typeof alertConfigs.$inferSelect,
  result: AlertTriggerResult,
): Promise<ClaimedAlertEvent | null> {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (trx) => {
    const rows = await trx.execute<{
      enabled: boolean;
      cooldown: string;
      last_triggered: Date | null;
    }>(sql`
      SELECT
        enabled,
        cooldown::text AS cooldown,
        last_triggered
      FROM alert_configs
      WHERE id = ${config.id}
      FOR UPDATE
    `);

    const locked = rows[0];
    if (!locked?.enabled) {
      return null;
    }

    if (locked.last_triggered) {
      const cooldownMs = parseCooldown(locked.cooldown);
      const elapsed = now.getTime() - new Date(locked.last_triggered).getTime();
      if (elapsed < cooldownMs) {
        return null;
      }
    }

    if (result.triggerTxHash) {
      const duplicate = await trx.execute(sql`
        SELECT 1
        FROM alert_events
        WHERE alert_config_id = ${config.id}
          AND trigger_tx_hash = ${result.triggerTxHash}
        LIMIT 1
      `);

      if (duplicate.length > 0) {
        return null;
      }
    }

    const [event] = await trx
      .insert(alertEvents)
      .values({
        timestamp: now,
        alertConfigId: config.id,
        walletAddress: config.walletAddress,
        chain: config.chain,
        alertType: config.alertType,
        severity: result.severity,
        title: result.title,
        description: result.description,
        triggerValue: result.triggerValue?.toString() ?? null,
        triggerTxHash: result.triggerTxHash,
        delivered: false,
      })
      .returning({ timestamp: alertEvents.timestamp });

    await trx
      .update(alertConfigs)
      .set({ lastTriggered: event!.timestamp, updatedAt: now })
      .where(eq(alertConfigs.id, config.id));

    return { eventTimestamp: event!.timestamp.toISOString() };
  });
}

/** Parse a PostgreSQL interval string to milliseconds */
function parseCooldown(cooldown: string): number {
  // Handle common PostgreSQL interval formats
  const match = cooldown.match(/(\d+)\s*(minute|minutes|hour|hours|second|seconds|day|days)/i);
  if (!match) return 5 * 60 * 1000; // default 5 minutes

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();

  switch (unit) {
    case 'second':
    case 'seconds':
      return value * 1000;
    case 'minute':
    case 'minutes':
      return value * 60 * 1000;
    case 'hour':
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'day':
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 5 * 60 * 1000;
  }
}

/** Parse a lookback window string to milliseconds */
function parseLookback(lookback: string): number {
  return parseCooldown(lookback); // Same parsing logic
}
