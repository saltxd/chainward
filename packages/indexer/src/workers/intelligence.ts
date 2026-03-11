import { Worker, Queue, type Job } from 'bullmq';
import { sql, eq, and, ne } from 'drizzle-orm';
import { agentRegistry, dailyAgentHealth, weeklyProtocolStats } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface IntelligenceJobData {
  type: 'health-score' | 'protocol-stats' | 'agent-classification';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker
// ═══════════════════════════════════════════════════════════════════════════════

export function createIntelligenceWorker() {
  const worker = new Worker<IntelligenceJobData>(
    'intelligence',
    async (job: Job<IntelligenceJobData>) => {
      switch (job.data.type) {
        case 'health-score':
          await computeHealthScores();
          break;
        case 'protocol-stats':
          await computeProtocolStats();
          break;
        case 'agent-classification':
          await classifyAgents();
          break;
      }
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Intelligence job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, type: job?.data?.type, err }, 'Intelligence job failed');
  });

  logger.info('Intelligence worker started');
  return worker;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule setup
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupIntelligenceSchedule(redis: import('ioredis').default) {
  const queue = new Queue('intelligence', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Health scores: daily at midnight UTC
  await queue.add(
    'health-score-daily',
    { type: 'health-score' },
    {
      repeat: { pattern: '0 0 * * *' },
      jobId: 'health-score-daily',
    },
  );

  // Protocol stats: weekly on Sunday at midnight UTC
  await queue.add(
    'protocol-stats-weekly',
    { type: 'protocol-stats' },
    {
      repeat: { pattern: '0 0 * * 0' },
      jobId: 'protocol-stats-weekly',
    },
  );

  // Agent classification: weekly on Sunday at 1am UTC
  await queue.add(
    'agent-classification-weekly',
    { type: 'agent-classification' },
    {
      repeat: { pattern: '0 1 * * 0' },
      jobId: 'agent-classification-weekly',
    },
  );

  logger.info('Intelligence schedule configured (daily health, weekly protocol stats + classification)');
  await queue.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Health Scores
// ═══════════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function computeHealthScores() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  logger.info('Computing daily health scores');

  // Get all agents
  const agents = await db
    .select({ id: agentRegistry.id, walletAddress: agentRegistry.walletAddress })
    .from(agentRegistry);

  if (agents.length === 0) return;

  const wallets = agents.map((a) => a.walletAddress);
  const walletArray = `{${wallets.join(',')}}`;

  // Per-agent daily stats from daily_agent_stats CAGG
  const dailyStatsRows = await db.execute(sql`
    SELECT
      wallet_address,
      bucket::date AS day,
      tx_count,
      gas_spent_usd
    FROM daily_agent_stats
    WHERE wallet_address = ANY(${walletArray}::text[])
      AND bucket >= ${thirtyDaysAgo}::timestamptz
    ORDER BY wallet_address, bucket
  `);

  const dailyStats = dailyStatsRows as unknown as Array<{
    wallet_address: string;
    day: string;
    tx_count: string;
    gas_spent_usd: string;
  }>;

  // Build per-wallet stats map
  const walletDailyMap = new Map<string, { txCounts: number[]; gasCosts: number[] }>();
  for (const row of dailyStats) {
    const w = row.wallet_address;
    if (!walletDailyMap.has(w)) {
      walletDailyMap.set(w, { txCounts: [], gasCosts: [] });
    }
    const entry = walletDailyMap.get(w)!;
    entry.txCounts.push(parseInt(row.tx_count, 10));
    entry.gasCosts.push(parseFloat(row.gas_spent_usd));
  }

  // Failure rates from raw transactions
  const failureRows = await db.execute(sql`
    SELECT
      wallet_address,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM transactions
    WHERE wallet_address = ANY(${walletArray}::text[])
      AND timestamp >= ${thirtyDaysAgo}::timestamptz
    GROUP BY wallet_address
  `);

  const failureMap = new Map<string, { total: number; failed: number }>();
  for (const row of failureRows as unknown as Array<{
    wallet_address: string;
    total: string;
    failed: string;
  }>) {
    failureMap.set(row.wallet_address, {
      total: parseInt(row.total, 10),
      failed: parseInt(row.failed, 10),
    });
  }

  // Fleet average gas per tx
  let fleetTotalGas = 0;
  let fleetTotalTxs = 0;
  for (const [, data] of walletDailyMap) {
    fleetTotalGas += data.gasCosts.reduce((a, b) => a + b, 0);
    fleetTotalTxs += data.txCounts.reduce((a, b) => a + b, 0);
  }
  const fleetAvgGasPerTx = fleetTotalTxs > 0 ? fleetTotalGas / fleetTotalTxs : 0;

  // Compute per-agent scores
  const healthRows: Array<{
    agentId: number;
    date: string;
    score: number;
    uptimePct: string;
    gasEfficiency: string;
    failureRate: string;
    consistency: string;
  }> = [];

  for (const agent of agents) {
    const daily = walletDailyMap.get(agent.walletAddress);
    const failures = failureMap.get(agent.walletAddress);

    // Uptime: % of last 30 days with at least 1 tx
    const daysActive = daily?.txCounts.length ?? 0;
    const uptimePct = clamp((daysActive / 30) * 100, 0, 100);

    // Gas efficiency: agent avg gas per tx vs fleet avg
    const agentTotalGas = daily?.gasCosts.reduce((a, b) => a + b, 0) ?? 0;
    const agentTotalTxs = daily?.txCounts.reduce((a, b) => a + b, 0) ?? 0;
    const agentAvgGasPerTx = agentTotalTxs > 0 ? agentTotalGas / agentTotalTxs : 0;

    let gasEfficiency: number;
    if (fleetAvgGasPerTx === 0 || agentTotalTxs === 0) {
      gasEfficiency = 50; // neutral if no data
    } else {
      gasEfficiency = clamp(100 - ((agentAvgGasPerTx / fleetAvgGasPerTx - 1) * 100), 0, 100);
    }

    // Failure rate: (1 - failed/total) * 100
    const totalTxs = failures?.total ?? 0;
    const failedTxs = failures?.failed ?? 0;
    const failureRateScore = totalTxs > 0
      ? clamp((1 - failedTxs / totalTxs) * 100, 0, 100)
      : 100; // no txs = no failures

    // Consistency: based on coefficient of variation of daily tx counts
    const txCounts = daily?.txCounts ?? [];
    let consistencyScore: number;
    if (txCounts.length < 2) {
      consistencyScore = 50; // not enough data
    } else {
      const mean = txCounts.reduce((a, b) => a + b, 0) / txCounts.length;
      const variance = txCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / txCounts.length;
      const stddev = Math.sqrt(variance);
      const cv = mean > 0 ? stddev / mean : 0;
      consistencyScore = clamp(100 - cv * 50, 0, 100);
    }

    // Weighted composite
    const score = Math.round(
      uptimePct * 0.25 +
      gasEfficiency * 0.25 +
      failureRateScore * 0.25 +
      consistencyScore * 0.25,
    );

    healthRows.push({
      agentId: agent.id,
      date: today,
      score: clamp(score, 0, 100),
      uptimePct: uptimePct.toFixed(2),
      gasEfficiency: gasEfficiency.toFixed(2),
      failureRate: failureRateScore.toFixed(2),
      consistency: consistencyScore.toFixed(2),
    });
  }

  // Upsert all health scores
  if (healthRows.length > 0) {
    for (const row of healthRows) {
      await db.execute(sql`
        INSERT INTO daily_agent_health (agent_id, date, score, uptime_pct, gas_efficiency, failure_rate, consistency)
        VALUES (${row.agentId}, ${row.date}::date, ${row.score}, ${row.uptimePct}, ${row.gasEfficiency}, ${row.failureRate}, ${row.consistency})
        ON CONFLICT (agent_id, date) DO UPDATE SET
          score = EXCLUDED.score,
          uptime_pct = EXCLUDED.uptime_pct,
          gas_efficiency = EXCLUDED.gas_efficiency,
          failure_rate = EXCLUDED.failure_rate,
          consistency = EXCLUDED.consistency
      `);
    }
  }

  logger.info({ count: healthRows.length }, 'Health scores computed');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Protocol Stats
// ═══════════════════════════════════════════════════════════════════════════════

async function computeProtocolStats() {
  const db = getDb();

  logger.info('Computing weekly protocol stats');

  // Get start of current ISO week (Monday)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - mondayOffset);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekAgo = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all agent wallets for scoping
  const agents = await db
    .select({ walletAddress: agentRegistry.walletAddress })
    .from(agentRegistry);

  if (agents.length === 0) return;

  const wallets = agents.map((a) => a.walletAddress);
  const walletArray = `{${wallets.join(',')}}`;

  const rows = await db.execute(sql`
    SELECT
      protocol_name AS protocol,
      COUNT(*) AS tx_count,
      COUNT(DISTINCT wallet_address) AS unique_agents,
      COALESCE(SUM(gas_cost_usd), 0) AS gas_total
    FROM transactions
    WHERE wallet_address = ANY(${walletArray}::text[])
      AND protocol_name IS NOT NULL
      AND timestamp >= ${weekAgo}::timestamptz
      AND timestamp < ${weekStart.toISOString()}::timestamptz
    GROUP BY protocol_name
    ORDER BY tx_count DESC
  `);

  const typed = rows as unknown as Array<{
    protocol: string;
    tx_count: string;
    unique_agents: string;
    gas_total: string;
  }>;

  for (const row of typed) {
    await db.execute(sql`
      INSERT INTO weekly_protocol_stats (week_start, protocol, tx_count, unique_agents, gas_total)
      VALUES (${weekStartStr}::date, ${row.protocol}, ${parseInt(row.tx_count, 10)}, ${parseInt(row.unique_agents, 10)}, ${parseFloat(row.gas_total).toFixed(6)})
      ON CONFLICT (week_start, protocol) DO UPDATE SET
        tx_count = EXCLUDED.tx_count,
        unique_agents = EXCLUDED.unique_agents,
        gas_total = EXCLUDED.gas_total
    `);
  }

  logger.info({ weekStart: weekStartStr, protocols: typed.length }, 'Protocol stats computed');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Agent Classification
// ═══════════════════════════════════════════════════════════════════════════════

type AgentType = 'trader' | 'rebalancer' | 'treasury' | 'social' | 'utility';

async function classifyAgents() {
  const db = getDb();

  logger.info('Running agent classification');

  // Get agents that aren't manually classified
  const agents = await db
    .select({
      id: agentRegistry.id,
      walletAddress: agentRegistry.walletAddress,
      classificationSource: agentRegistry.classificationSource,
    })
    .from(agentRegistry)
    .where(
      ne(agentRegistry.classificationSource, 'manual'),
    );

  if (agents.length === 0) {
    logger.info('No agents to classify (all manual)');
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let classified = 0;

  for (const agent of agents) {
    // Get transaction summary for this agent
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*) AS total_txs,
        COUNT(*) FILTER (WHERE tx_type = 'swap') AS swap_count,
        COUNT(*) FILTER (WHERE tx_type = 'transfer') AS transfer_count,
        COUNT(*) FILTER (WHERE tx_type = 'contract_call') AS contract_call_count,
        COUNT(*) FILTER (WHERE tx_type = 'approval') AS approval_count,
        COUNT(*) FILTER (WHERE direction = 'in') AS inbound_count,
        COUNT(*) FILTER (WHERE direction = 'out') AS outbound_count,
        COUNT(DISTINCT counterparty) AS unique_counterparties,
        COALESCE(AVG(CASE WHEN amount_usd IS NOT NULL THEN amount_usd::numeric END), 0) AS avg_amount_usd
      FROM transactions
      WHERE wallet_address = ${agent.walletAddress}
        AND timestamp >= ${thirtyDaysAgo}::timestamptz
    `);

    const s = (summaryRows as unknown as Array<Record<string, string>>)[0] as
      Record<string, string> | undefined;
    if (!s) continue;

    const totalTxs = parseInt(s['total_txs'] ?? '0', 10);
    if (totalTxs === 0) continue;

    const swapPct = parseInt(s['swap_count'] ?? '0', 10) / totalTxs;
    const inboundPct = parseInt(s['inbound_count'] ?? '0', 10) / totalTxs;
    const uniqueCounterparties = parseInt(s['unique_counterparties'] ?? '0', 10);
    const avgAmountUsd = parseFloat(s['avg_amount_usd'] ?? '0');
    const contractCallCount = parseInt(s['contract_call_count'] ?? '0', 10);

    let agentType: AgentType | null = null;

    // Check for rebalancer before trader (more specific pattern)
    if (swapPct > 0.5) {
      // Check for regular intervals (rebalancer pattern)
      const intervalRows = await db.execute(sql`
        SELECT
          EXTRACT(EPOCH FROM timestamp - LAG(timestamp) OVER (ORDER BY timestamp)) AS interval_secs
        FROM transactions
        WHERE wallet_address = ${agent.walletAddress}
          AND tx_type = 'swap'
          AND timestamp >= ${thirtyDaysAgo}::timestamptz
        ORDER BY timestamp
      `);

      const intervals = (intervalRows as unknown as Array<{ interval_secs: string | null }>)
        .filter((r) => r.interval_secs != null)
        .map((r) => parseFloat(r.interval_secs!));

      if (intervals.length >= 3) {
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : Infinity;

        // CV < 0.5 = fairly regular intervals → rebalancer
        if (cv < 0.5 && swapPct > 0.5) {
          agentType = 'rebalancer';
        }
      }

      // Fall through to trader if not rebalancer
      if (!agentType && swapPct > 0.7) {
        agentType = 'trader';
      }
    }

    // Treasury: mostly receives, occasional large sends
    if (!agentType && inboundPct > 0.6) {
      agentType = 'treasury';
    }

    // Social: many counterparties, small amounts
    if (!agentType && uniqueCounterparties > 5 && avgAmountUsd < 50) {
      agentType = 'social';
    }

    // Utility: contract deployments, governance-like patterns
    if (!agentType && contractCallCount > totalTxs * 0.5) {
      agentType = 'utility';
    }

    if (agentType) {
      await db
        .update(agentRegistry)
        .set({ agentType, classificationSource: 'auto' })
        .where(eq(agentRegistry.id, agent.id));
      classified++;
    }
  }

  logger.info({ classified, total: agents.length }, 'Agent classification complete');
}
