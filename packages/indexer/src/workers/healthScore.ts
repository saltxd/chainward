// Pure health-score formula. Worker + DB integration lands in Task 6.

export interface HealthInputs {
  uptimePct: number;    // 0–100
  failureRate: number;  // 0–100
  gasEfficiency: number; // 0–100
  consistency: number;  // 0–100
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeHealthScore(inputs: HealthInputs): number {
  const u = clamp(inputs.uptimePct);
  const f = clamp(inputs.failureRate);
  const g = clamp(inputs.gasEfficiency);
  const c = clamp(inputs.consistency);

  return Math.round(0.30 * u + 0.25 * (100 - f) + 0.25 * g + 0.20 * c);
}

// ─── Worker + DB integration ─────────────────────────────────────────────────

import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── Per-agent inputs computed from transactions table ────────────────────────

async function loadInputs(db: ReturnType<typeof getDb>, walletAddress: string): Promise<HealthInputs> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Uptime: % of 168 hourly windows with ≥1 tx
  const uptimeRows = await db.execute(sql`
    WITH hours AS (
      SELECT generate_series(
        date_trunc('hour', NOW() - INTERVAL '7 days'),
        date_trunc('hour', NOW()),
        INTERVAL '1 hour'
      ) AS h
    ),
    active AS (
      SELECT DISTINCT date_trunc('hour', timestamp) AS h
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND timestamp >= ${weekAgo}::timestamptz
    )
    SELECT
      COUNT(active.h)::float / NULLIF(COUNT(hours.h), 0)::float * 100 AS uptime_pct
    FROM hours
    LEFT JOIN active USING (h)
  `);
  const uptimePct = parseFloat(
    String((uptimeRows as unknown as Array<{ uptime_pct: string | null }>)[0]?.uptime_pct ?? '0'),
  );

  // Failure rate
  const failureRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed')::float
        / NULLIF(COUNT(*), 0)::float * 100 AS failure_rate
    FROM transactions
    WHERE LOWER(wallet_address) = LOWER(${walletAddress})
      AND timestamp >= ${weekAgo}::timestamptz
  `);
  const failureRate = parseFloat(
    String((failureRows as unknown as Array<{ failure_rate: string | null }>)[0]?.failure_rate ?? '0'),
  );

  // Gas efficiency: this agent's avg gas-per-tx, normalized vs cohort.
  // Below cohort median = high score; above p95 = 0.
  const gasRows = await db.execute(sql`
    WITH per_agent AS (
      SELECT
        wallet_address,
        AVG(CAST(gas_cost_usd AS numeric))::float AS avg_gas
      FROM transactions
      WHERE timestamp >= ${weekAgo}::timestamptz
        AND gas_cost_usd IS NOT NULL
      GROUP BY wallet_address
    ),
    cohort AS (
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_gas) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY avg_gas) AS p95
      FROM per_agent
    ),
    me AS (
      SELECT avg_gas FROM per_agent WHERE LOWER(wallet_address) = LOWER(${walletAddress})
    )
    SELECT
      CASE
        WHEN me.avg_gas IS NULL THEN 50
        WHEN cohort.p95 IS NULL OR cohort.p95 = 0 THEN 50
        WHEN me.avg_gas <= cohort.p50 THEN 100
        WHEN me.avg_gas >= cohort.p95 THEN 0
        ELSE 100 - ((me.avg_gas - cohort.p50) / (cohort.p95 - cohort.p50)) * 100
      END AS gas_efficiency
    FROM cohort, me
  `);
  const gasEfficiency = parseFloat(
    String((gasRows as unknown as Array<{ gas_efficiency: string | null }>)[0]?.gas_efficiency ?? '50'),
  );

  // Consistency: 100 - normalized stddev of daily tx counts
  const consistencyRows = await db.execute(sql`
    WITH daily AS (
      SELECT date_trunc('day', timestamp) AS d, COUNT(*) AS c
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND timestamp >= ${weekAgo}::timestamptz
      GROUP BY d
    )
    SELECT
      CASE
        WHEN COUNT(*) < 2 THEN 0
        WHEN AVG(c) = 0 THEN 0
        ELSE GREATEST(0, 100 - (STDDEV_POP(c::float) / AVG(c::float) * 100))
      END AS consistency
    FROM daily
  `);
  const consistency = parseFloat(
    String((consistencyRows as unknown as Array<{ consistency: string | null }>)[0]?.consistency ?? '0'),
  );

  return { uptimePct, failureRate, gasEfficiency, consistency };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createHealthScoreWorker() {
  return new Worker(
    'health-score',
    async (_job: Job) => {
      const db = getDb();

      const agents = await db.execute(sql`
        SELECT id, wallet_address
        FROM agent_registry
        WHERE is_observatory = true AND is_public = true
      `);
      const typed = agents as unknown as Array<{ id: number; wallet_address: string }>;

      let written = 0;
      let failed = 0;
      for (const a of typed) {
        try {
          const inputs = await loadInputs(db, a.wallet_address);
          const score = computeHealthScore(inputs);

          await db.execute(sql`
            INSERT INTO daily_agent_health
              (agent_id, date, score, uptime_pct, gas_efficiency, failure_rate, consistency)
            VALUES
              (${a.id}, CURRENT_DATE, ${score},
               ${inputs.uptimePct.toFixed(2)}, ${inputs.gasEfficiency.toFixed(2)},
               ${inputs.failureRate.toFixed(2)}, ${inputs.consistency.toFixed(2)})
            ON CONFLICT (agent_id, date) DO UPDATE
              SET score = EXCLUDED.score,
                  uptime_pct = EXCLUDED.uptime_pct,
                  gas_efficiency = EXCLUDED.gas_efficiency,
                  failure_rate = EXCLUDED.failure_rate,
                  consistency = EXCLUDED.consistency
          `);
          written++;
        } catch (err) {
          failed++;
          logger.error(
            {
              agentId: a.id,
              wallet: a.wallet_address,
              err: err instanceof Error ? err.message : String(err),
            },
            'healthScore: failed to compute/write for agent',
          );
        }
      }

      if (failed > 0) {
        logger.warn({ failed, total: typed.length }, 'healthScore: completed with row-level failures');
      }
      logger.info({ written, failed }, 'healthScore: wrote daily_agent_health rows');
      return { written, failed };
    },
    { connection: getRedis(), concurrency: 1 },
  );
}

// ─── Schedule setup ───────────────────────────────────────────────────────────

export async function setupHealthScoreSchedule(redis: import('ioredis').default) {
  const queue = new Queue('health-score', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Daily at 04:00 UTC
  await queue.add(
    'health-score-daily',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      jobId: 'health-score-daily',
    },
  );

  logger.info('Health score schedule configured (daily at 04:00 UTC)');
  await queue.close();
}
