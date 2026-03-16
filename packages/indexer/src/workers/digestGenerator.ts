import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { weeklyDigests, acpAgentSnapshots, acpAgentData } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface DigestJobData {
  type: 'digest' | 'snapshot';
}

interface HeadlineNumbers {
  totalRevenue: number;
  totalGas: number;
  netProfit: number;
  activeAgents: number;
  totalJobs: number;
  newAgents: number;
  wow: {
    revenueChange: number | null;
    gasChange: number | null;
    profitChange: number | null;
    activeAgentsChange: number | null;
    jobsChange: number | null;
  };
}

interface LeaderboardEntry {
  name: string | null;
  walletAddress: string;
  revenue: number;
  gasCost: number;
  profit: number;
}

interface MoverEntry {
  name: string | null;
  walletAddress: string;
  previousRevenue: number;
  currentRevenue: number;
  changePct: number;
}

interface Leaderboards {
  mostProfitable: LeaderboardEntry[];
  mostEfficient: Array<LeaderboardEntry & { efficiency: number }>;
  biggestMovers: {
    gainers: MoverEntry[];
    decliners: MoverEntry[];
  };
}

interface SpotlightData {
  name: string | null;
  walletAddress: string;
  revenue: number;
  gasCost: number;
  profit: number;
  margin: number;
  jobs: number;
  successRate: number;
  uniqueHirers: number;
  topProtocols: string[];
  healthScore: number | null;
  notable: string;
}

interface ProtocolEntry {
  protocolName: string;
  txCount: number;
  sharePct: number;
  gasCost: number;
}

interface AnomalyEntry {
  type: string;
  agentName: string | null;
  walletAddress: string;
  detail: string;
}

interface QuickStats {
  busiestHour: { day: string; hour: number; txCount: number } | null;
  mostExpensiveTx: { txHash: string; gasCostUsd: number; walletAddress: string } | null;
  longestIdleAgent: { name: string | null; walletAddress: string; lastTxDaysAgo: number } | null;
  highestRevenue: { name: string | null; revenue: number } | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Week boundary helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getPriorWeekBoundaries(): { weekStart: string; weekEnd: string; priorWeekStart: string } {
  const now = new Date();
  // Find Monday 00:00 UTC of the current week
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - mondayOffset);
  thisMonday.setUTCHours(0, 0, 0, 0);

  // Prior week: previous Monday → previous Sunday
  const weekEnd = new Date(thisMonday); // This Monday = end boundary (exclusive)
  const weekStart = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const priorWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    priorWeekStart: priorWeekStart.toISOString().slice(0, 10),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Snapshot ACP data
// ═══════════════════════════════════════════════════════════════════════════════

async function snapshotAcpData(weekStartDate: string) {
  const db = getDb();

  logger.info({ weekStart: weekStartDate }, 'Snapshotting ACP agent data');

  const result = await db.execute(sql`
    INSERT INTO acp_agent_snapshots (wallet_address, name, week_start, revenue, gross_agentic_amount, successful_job_count, success_rate, unique_buyer_count)
    SELECT
      wallet_address,
      name,
      ${weekStartDate}::date,
      revenue,
      gross_agentic_amount,
      successful_job_count,
      success_rate,
      unique_buyer_count
    FROM acp_agent_data
    WHERE wallet_address IS NOT NULL
    ON CONFLICT (wallet_address, week_start) DO UPDATE SET
      name = EXCLUDED.name,
      revenue = EXCLUDED.revenue,
      gross_agentic_amount = EXCLUDED.gross_agentic_amount,
      successful_job_count = EXCLUDED.successful_job_count,
      success_rate = EXCLUDED.success_rate,
      unique_buyer_count = EXCLUDED.unique_buyer_count,
      captured_at = NOW()
  `);

  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  logger.info({ weekStart: weekStartDate, count }, 'ACP snapshot complete');
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: Headline Numbers
// ═══════════════════════════════════════════════════════════════════════════════

async function buildHeadline(weekStart: string, weekEnd: string, priorWeekStart: string): Promise<HeadlineNumbers> {
  const db = getDb();

  // Revenue: difference between current and prior week snapshots
  const revenueRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(
        COALESCE(CAST(curr.revenue AS numeric), 0) -
        COALESCE(CAST(prev.revenue AS numeric), 0)
      ), 0) AS total_revenue,
      COUNT(DISTINCT curr.wallet_address) FILTER (WHERE CAST(COALESCE(curr.revenue, '0') AS numeric) - CAST(COALESCE(prev.revenue, '0') AS numeric) > 0) AS agents_with_revenue
    FROM acp_agent_snapshots curr
    LEFT JOIN acp_agent_snapshots prev
      ON curr.wallet_address = prev.wallet_address
      AND prev.week_start = ${priorWeekStart}::date
    WHERE curr.week_start = ${weekStart}::date
  `);

  const revData = (revenueRows as unknown as Array<Record<string, string>>)[0];
  const totalRevenue = parseFloat(revData?.['total_revenue'] ?? '0');

  // If no prior snapshot, use current values directly
  let adjustedRevenue = totalRevenue;
  const hasPriorSnapshot = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM acp_agent_snapshots WHERE week_start = ${priorWeekStart}::date
  `);
  const priorCount = parseInt(((hasPriorSnapshot as unknown as Array<Record<string, string>>)[0])?.['cnt'] ?? '0', 10);
  if (priorCount === 0) {
    const currentRevRows = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(revenue AS numeric)), 0) AS total
      FROM acp_agent_snapshots WHERE week_start = ${weekStart}::date
    `);
    adjustedRevenue = parseFloat(((currentRevRows as unknown as Array<Record<string, string>>)[0])?.['total'] ?? '0');
  }

  // Jobs: difference in successful_job_count
  const jobRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(
        COALESCE(curr.successful_job_count, 0) -
        COALESCE(prev.successful_job_count, 0)
      ), 0) AS total_jobs
    FROM acp_agent_snapshots curr
    LEFT JOIN acp_agent_snapshots prev
      ON curr.wallet_address = prev.wallet_address
      AND prev.week_start = ${priorWeekStart}::date
    WHERE curr.week_start = ${weekStart}::date
  `);

  let totalJobs = parseInt(((jobRows as unknown as Array<Record<string, string>>)[0])?.['total_jobs'] ?? '0', 10);
  if (priorCount === 0) {
    const currentJobRows = await db.execute(sql`
      SELECT COALESCE(SUM(successful_job_count), 0) AS total
      FROM acp_agent_snapshots WHERE week_start = ${weekStart}::date
    `);
    totalJobs = parseInt(((currentJobRows as unknown as Array<Record<string, string>>)[0])?.['total'] ?? '0', 10);
  }

  // Gas: sum of gas_cost_usd from observatory agent transactions during the week
  const gasRows = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(t.gas_cost_usd AS numeric)), 0) AS total_gas
    FROM transactions t
    WHERE t.wallet_address IN (
      SELECT wallet_address FROM agent_registry WHERE is_observatory = true
    )
    AND t.timestamp >= ${weekStart}::date
    AND t.timestamp < ${weekEnd}::date
  `);
  const totalGas = parseFloat(((gasRows as unknown as Array<Record<string, string>>)[0])?.['total_gas'] ?? '0');

  // Active agents: distinct wallet_address from transactions this week
  const activeRows = await db.execute(sql`
    SELECT COUNT(DISTINCT wallet_address) AS active_agents
    FROM transactions
    WHERE timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
      AND wallet_address IN (
        SELECT wallet_address FROM agent_registry WHERE is_observatory = true
      )
  `);
  const activeAgents = parseInt(((activeRows as unknown as Array<Record<string, string>>)[0])?.['active_agents'] ?? '0', 10);

  // New agents: ACP agents created during this week
  const newRows = await db.execute(sql`
    SELECT COUNT(*) AS new_agents
    FROM acp_agent_data
    WHERE created_at >= ${weekStart}::date
      AND created_at < ${weekEnd}::date
  `);
  const newAgents = parseInt(((newRows as unknown as Array<Record<string, string>>)[0])?.['new_agents'] ?? '0', 10);

  // WoW: compare against prior week's digest
  let wow: HeadlineNumbers['wow'] = {
    revenueChange: null,
    gasChange: null,
    profitChange: null,
    activeAgentsChange: null,
    jobsChange: null,
  };

  const priorDigestRows = await db.execute(sql`
    SELECT headline FROM weekly_digests WHERE week_start = ${priorWeekStart}::date LIMIT 1
  `);
  const priorDigest = (priorDigestRows as unknown as Array<{ headline: HeadlineNumbers | null }>)[0];

  if (priorDigest?.headline) {
    const prev = priorDigest.headline;
    const pctChange = (curr: number, prevVal: number) =>
      prevVal !== 0 ? Math.round(((curr - prevVal) / Math.abs(prevVal)) * 1000) / 10 : null;

    wow = {
      revenueChange: pctChange(adjustedRevenue, prev.totalRevenue),
      gasChange: pctChange(totalGas, prev.totalGas),
      profitChange: pctChange(adjustedRevenue - totalGas, prev.netProfit),
      activeAgentsChange: pctChange(activeAgents, prev.activeAgents),
      jobsChange: pctChange(totalJobs, prev.totalJobs),
    };
  }

  return {
    totalRevenue: Math.round(adjustedRevenue * 100) / 100,
    totalGas: Math.round(totalGas * 100) / 100,
    netProfit: Math.round((adjustedRevenue - totalGas) * 100) / 100,
    activeAgents,
    totalJobs,
    newAgents,
    wow,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Leaderboards
// ═══════════════════════════════════════════════════════════════════════════════

async function buildLeaderboards(weekStart: string, weekEnd: string, priorWeekStart: string): Promise<Leaderboards> {
  const db = getDb();

  // Most Profitable: join ACP revenue with on-chain gas via virtualAgentId bridge
  const profitableRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address,
      COALESCE(CAST(acp.revenue AS numeric), 0) AS revenue,
      COALESCE((
        SELECT SUM(CAST(t.gas_cost_usd AS numeric))
        FROM transactions t
        WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
          AND t.timestamp >= ${weekStart}::date
          AND t.timestamp < ${weekEnd}::date
      ), 0) AS gas_cost
    FROM acp_agent_data acp
    LEFT JOIN agent_registry ar
      ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    WHERE acp.revenue IS NOT NULL
      AND CAST(acp.revenue AS numeric) > 0
    ORDER BY (CAST(acp.revenue AS numeric) - COALESCE((
      SELECT SUM(CAST(t.gas_cost_usd AS numeric))
      FROM transactions t
      WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
        AND t.timestamp >= ${weekStart}::date
        AND t.timestamp < ${weekEnd}::date
    ), 0)) DESC
    LIMIT 5
  `);

  const mostProfitable: LeaderboardEntry[] = (profitableRows as unknown as Array<Record<string, string>>).map((r) => ({
    name: r['name'] ?? null,
    walletAddress: r['wallet_address'] ?? '',
    revenue: parseFloat(r['revenue'] ?? '0'),
    gasCost: parseFloat(r['gas_cost'] ?? '0'),
    profit: parseFloat(r['revenue'] ?? '0') - parseFloat(r['gas_cost'] ?? '0'),
  }));

  // Most Efficient: revenue / gas where gas > 0
  const efficientRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address,
      COALESCE(CAST(acp.revenue AS numeric), 0) AS revenue,
      sub.gas_cost,
      CASE WHEN sub.gas_cost > 0
        THEN ROUND(CAST(acp.revenue AS numeric) / sub.gas_cost, 2)
        ELSE 0
      END AS efficiency
    FROM acp_agent_data acp
    LEFT JOIN agent_registry ar
      ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(CAST(t.gas_cost_usd AS numeric)), 0) AS gas_cost
      FROM transactions t
      WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
        AND t.timestamp >= ${weekStart}::date
        AND t.timestamp < ${weekEnd}::date
    ) sub
    WHERE acp.revenue IS NOT NULL
      AND CAST(acp.revenue AS numeric) > 0
      AND sub.gas_cost > 0
    ORDER BY efficiency DESC
    LIMIT 5
  `);

  const mostEfficient = (efficientRows as unknown as Array<Record<string, string>>).map((r) => ({
    name: r['name'] ?? null,
    walletAddress: r['wallet_address'] ?? '',
    revenue: parseFloat(r['revenue'] ?? '0'),
    gasCost: parseFloat(r['gas_cost'] ?? '0'),
    profit: parseFloat(r['revenue'] ?? '0') - parseFloat(r['gas_cost'] ?? '0'),
    efficiency: parseFloat(r['efficiency'] ?? '0'),
  }));

  // Biggest Movers: compare current acp_agent_data vs prior week snapshot
  const moverRows = await db.execute(sql`
    SELECT
      curr.name,
      curr.wallet_address,
      COALESCE(CAST(prev.revenue AS numeric), 0) AS prev_revenue,
      COALESCE(CAST(curr.revenue AS numeric), 0) AS curr_revenue,
      CASE
        WHEN COALESCE(CAST(prev.revenue AS numeric), 0) > 0
        THEN ROUND(((CAST(curr.revenue AS numeric) - CAST(prev.revenue AS numeric)) / CAST(prev.revenue AS numeric)) * 100, 1)
        ELSE NULL
      END AS change_pct
    FROM acp_agent_data curr
    LEFT JOIN acp_agent_snapshots prev
      ON curr.wallet_address = prev.wallet_address
      AND prev.week_start = ${priorWeekStart}::date
    WHERE curr.revenue IS NOT NULL
      AND CAST(curr.revenue AS numeric) > 0
      AND prev.revenue IS NOT NULL
      AND CAST(prev.revenue AS numeric) > 0
    ORDER BY change_pct DESC NULLS LAST
  `);

  const allMovers = (moverRows as unknown as Array<Record<string, string>>)
    .filter((r) => r['change_pct'] != null)
    .map((r) => ({
      name: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      previousRevenue: parseFloat(r['prev_revenue'] ?? '0'),
      currentRevenue: parseFloat(r['curr_revenue'] ?? '0'),
      changePct: parseFloat(r['change_pct'] ?? '0'),
    }));

  const gainers = allMovers.filter((m) => m.changePct > 0).slice(0, 3);
  const decliners = allMovers.filter((m) => m.changePct < 0).reverse().slice(0, 2);

  return {
    mostProfitable,
    mostEfficient,
    biggestMovers: { gainers, decliners },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3: Spotlight
// ═══════════════════════════════════════════════════════════════════════════════

async function buildSpotlight(weekStart: string, weekEnd: string, priorWeekStart: string): Promise<SpotlightData | null> {
  const db = getDb();

  // Score candidates: skip recently spotlighted
  const candidateRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address,
      COALESCE(CAST(acp.revenue AS numeric), 0) AS revenue,
      COALESCE(acp.successful_job_count, 0) AS job_count,
      COALESCE(CAST(acp.success_rate AS numeric), 0) AS success_rate,
      COALESCE(acp.unique_buyer_count, 0) AS unique_hirers,
      COALESCE(CAST(prev.revenue AS numeric), 0) AS prev_revenue,
      acp.last_spotlighted_at,
      acp.virtual_agent_id,
      ar.wallet_address AS observatory_wallet,
      ar.id AS agent_registry_id
    FROM acp_agent_data acp
    LEFT JOIN acp_agent_snapshots prev
      ON acp.wallet_address = prev.wallet_address
      AND prev.week_start = ${priorWeekStart}::date
    LEFT JOIN agent_registry ar
      ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    WHERE acp.revenue IS NOT NULL
      AND CAST(acp.revenue AS numeric) > 0
      AND (acp.last_spotlighted_at IS NULL OR acp.last_spotlighted_at < NOW() - INTERVAL '28 days')
    ORDER BY CAST(acp.revenue AS numeric) DESC
    LIMIT 100
  `);

  const candidates = candidateRows as unknown as Array<Record<string, string | null>>;
  if (candidates.length === 0) return null;

  // Score each candidate
  let bestScore = -1;
  let bestIdx = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const revenue = parseFloat(c['revenue'] ?? '0');
    const prevRevenue = parseFloat(c['prev_revenue'] ?? '0');
    const jobCount = parseInt(c['job_count'] ?? '0', 10);
    const lastSpotlighted = c['last_spotlighted_at'];

    // Gas cost for this agent
    const onchainWallet = c['observatory_wallet'] ?? c['wallet_address'] ?? '';
    const gasRows = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(gas_cost_usd AS numeric)), 0) AS gas
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${onchainWallet})
        AND timestamp >= ${weekStart}::date
        AND timestamp < ${weekEnd}::date
    `);
    const gasCost = parseFloat(((gasRows as unknown as Array<Record<string, string>>)[0])?.['gas'] ?? '0');
    const profit = revenue - gasCost;

    const wowChangePct = prevRevenue > 0 ? Math.abs((revenue - prevRevenue) / prevRevenue * 100) : 0;
    const notRecentlySpotlighted = lastSpotlighted == null ? 1 : 0;

    const score =
      (Math.abs(profit) > 0 ? Math.min(profit, 10000) / 10000 : 0) * 0.3 +
      (Math.min(wowChangePct, 1000) / 1000) * 0.3 +
      (Math.min(jobCount, 100000) / 100000) * 0.2 +
      notRecentlySpotlighted * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const winner = candidates[bestIdx]!;
  const walletAddress = winner['wallet_address'] ?? '';
  const onchainWallet = winner['observatory_wallet'] ?? walletAddress;
  const registryId = winner['agent_registry_id'] ? parseInt(winner['agent_registry_id'], 10) : null;

  // Get gas cost for the winner
  const gasRows = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(gas_cost_usd AS numeric)), 0) AS gas
    FROM transactions
    WHERE LOWER(wallet_address) = LOWER(${onchainWallet})
      AND timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
  `);
  const gasCost = parseFloat(((gasRows as unknown as Array<Record<string, string>>)[0])?.['gas'] ?? '0');

  const revenue = parseFloat(winner['revenue'] ?? '0');
  const profit = revenue - gasCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  const prevRevenue = parseFloat(winner['prev_revenue'] ?? '0');
  const jobs = parseInt(winner['job_count'] ?? '0', 10);
  const successRate = parseFloat(winner['success_rate'] ?? '0');
  const uniqueHirers = parseInt(winner['unique_hirers'] ?? '0', 10);

  // Top protocols
  const protocolRows = await db.execute(sql`
    SELECT protocol_name, COUNT(*) AS cnt
    FROM transactions
    WHERE LOWER(wallet_address) = LOWER(${onchainWallet})
      AND timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
      AND protocol_name IS NOT NULL
    GROUP BY protocol_name
    ORDER BY cnt DESC
    LIMIT 3
  `);
  const topProtocols = (protocolRows as unknown as Array<Record<string, string>>)
    .map((r) => r['protocol_name'] ?? '')
    .filter(Boolean);

  // Health score
  let healthScore: number | null = null;
  if (registryId != null) {
    const healthRows = await db.execute(sql`
      SELECT score FROM daily_agent_health
      WHERE agent_id = ${registryId}
      ORDER BY date DESC LIMIT 1
    `);
    const h = (healthRows as unknown as Array<Record<string, string>>)[0];
    if (h) healthScore = parseInt(h['score'] ?? '0', 10);
  }

  // Generate notable sentence
  let notable: string;
  const wowPct = prevRevenue > 0 ? Math.round((revenue - prevRevenue) / prevRevenue * 100) : null;

  if (wowPct != null && Math.abs(wowPct) >= 50) {
    notable = `Revenue ${wowPct > 0 ? 'increased' : 'decreased'} ${Math.abs(wowPct)}% week over week`;
  } else if (jobs >= 10000 && successRate >= 99) {
    notable = `Completed ${jobs.toLocaleString()} jobs with ${successRate}% success rate`;
  } else if (margin >= 80) {
    notable = `Operating at ${margin}% profit margin with $${revenue.toFixed(2)} revenue`;
  } else if (uniqueHirers >= 50) {
    notable = `Served ${uniqueHirers} unique hirers this period`;
  } else {
    notable = `Generated $${profit.toFixed(2)} net profit from ${jobs.toLocaleString()} jobs`;
  }

  // Mark as spotlighted
  await db.execute(sql`
    UPDATE acp_agent_data SET last_spotlighted_at = NOW() WHERE wallet_address = ${walletAddress}
  `);

  return {
    name: winner['name'] ?? null,
    walletAddress,
    revenue: Math.round(revenue * 100) / 100,
    gasCost: Math.round(gasCost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin,
    jobs,
    successRate,
    uniqueHirers,
    topProtocols,
    healthScore,
    notable,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4: Protocol Activity
// ═══════════════════════════════════════════════════════════════════════════════

async function buildProtocolActivity(weekStart: string, weekEnd: string): Promise<ProtocolEntry[]> {
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      protocol_name,
      COUNT(*) AS tx_count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS share_pct,
      COALESCE(SUM(CAST(gas_cost_usd AS numeric)), 0) AS gas_cost
    FROM transactions
    WHERE timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
      AND wallet_address IN (
        SELECT wallet_address FROM agent_registry WHERE is_observatory = true
      )
      AND protocol_name IS NOT NULL
    GROUP BY protocol_name
    ORDER BY tx_count DESC
    LIMIT 10
  `);

  return (rows as unknown as Array<Record<string, string>>).map((r) => ({
    protocolName: r['protocol_name'] ?? '',
    txCount: parseInt(r['tx_count'] ?? '0', 10),
    sharePct: parseFloat(r['share_pct'] ?? '0'),
    gasCost: Math.round(parseFloat(r['gas_cost'] ?? '0') * 100) / 100,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5: Alerts & Anomalies
// ═══════════════════════════════════════════════════════════════════════════════

async function buildAlertsAnomalies(weekStart: string, weekEnd: string, priorWeekStart: string): Promise<AnomalyEntry[]> {
  const db = getDb();
  const anomalies: AnomalyEntry[] = [];

  // 1. Agents with >50% revenue drop
  const dropRows = await db.execute(sql`
    SELECT
      curr.name,
      curr.wallet_address,
      CAST(prev.revenue AS numeric) AS prev_revenue,
      CAST(curr.revenue AS numeric) AS curr_revenue,
      ROUND(((CAST(curr.revenue AS numeric) - CAST(prev.revenue AS numeric)) / CAST(prev.revenue AS numeric)) * 100, 1) AS change_pct
    FROM acp_agent_data curr
    JOIN acp_agent_snapshots prev
      ON curr.wallet_address = prev.wallet_address
      AND prev.week_start = ${priorWeekStart}::date
    WHERE prev.revenue IS NOT NULL
      AND CAST(prev.revenue AS numeric) > 0
      AND curr.revenue IS NOT NULL
      AND ((CAST(curr.revenue AS numeric) - CAST(prev.revenue AS numeric)) / CAST(prev.revenue AS numeric)) < -0.5
    ORDER BY change_pct ASC
    LIMIT 5
  `);

  for (const r of dropRows as unknown as Array<Record<string, string>>) {
    anomalies.push({
      type: 'revenue_drop',
      agentName: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      detail: `Revenue dropped ${Math.abs(parseFloat(r['change_pct'] ?? '0'))}% ($${parseFloat(r['prev_revenue'] ?? '0').toFixed(2)} -> $${parseFloat(r['curr_revenue'] ?? '0').toFixed(2)})`,
    });
  }

  // 2. Agents where gas > revenue (operating at a loss)
  const lossRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address,
      COALESCE(CAST(acp.revenue AS numeric), 0) AS revenue,
      COALESCE(sub.gas_cost, 0) AS gas_cost
    FROM acp_agent_data acp
    LEFT JOIN agent_registry ar
      ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(CAST(t.gas_cost_usd AS numeric)), 0) AS gas_cost
      FROM transactions t
      WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
        AND t.timestamp >= ${weekStart}::date
        AND t.timestamp < ${weekEnd}::date
    ) sub
    WHERE acp.revenue IS NOT NULL
      AND CAST(acp.revenue AS numeric) > 0
      AND sub.gas_cost > CAST(acp.revenue AS numeric)
    ORDER BY (sub.gas_cost - CAST(acp.revenue AS numeric)) DESC
    LIMIT 5
  `);

  for (const r of lossRows as unknown as Array<Record<string, string>>) {
    const rev = parseFloat(r['revenue'] ?? '0');
    const gas = parseFloat(r['gas_cost'] ?? '0');
    anomalies.push({
      type: 'operating_at_loss',
      agentName: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      detail: `Gas ($${gas.toFixed(2)}) exceeds revenue ($${rev.toFixed(2)}), net loss $${(gas - rev).toFixed(2)}`,
    });
  }

  // 3. Observatory agents with 0 txs in 7+ days (went inactive)
  const inactiveRows = await db.execute(sql`
    SELECT
      ar.agent_name AS name,
      ar.wallet_address,
      MAX(t.timestamp) AS last_tx
    FROM agent_registry ar
    LEFT JOIN transactions t ON LOWER(t.wallet_address) = LOWER(ar.wallet_address)
    WHERE ar.is_observatory = true
    GROUP BY ar.id, ar.agent_name, ar.wallet_address
    HAVING MAX(t.timestamp) IS NOT NULL
      AND MAX(t.timestamp) < (${weekEnd}::date - INTERVAL '7 days')
    ORDER BY MAX(t.timestamp) ASC
    LIMIT 5
  `);

  for (const r of inactiveRows as unknown as Array<Record<string, string>>) {
    const lastTx = new Date(r['last_tx'] ?? '');
    const daysAgo = Math.floor((new Date(weekEnd).getTime() - lastTx.getTime()) / (24 * 60 * 60 * 1000));
    anomalies.push({
      type: 'went_inactive',
      agentName: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      detail: `No transactions in ${daysAgo} days (last tx: ${lastTx.toISOString().slice(0, 10)})`,
    });
  }

  // 4. New agents with >$100 first-week revenue
  const newHighRows = await db.execute(sql`
    SELECT
      name,
      wallet_address,
      COALESCE(CAST(revenue AS numeric), 0) AS revenue
    FROM acp_agent_data
    WHERE created_at >= ${weekStart}::date
      AND created_at < ${weekEnd}::date
      AND revenue IS NOT NULL
      AND CAST(revenue AS numeric) > 100
    ORDER BY CAST(revenue AS numeric) DESC
    LIMIT 5
  `);

  for (const r of newHighRows as unknown as Array<Record<string, string>>) {
    anomalies.push({
      type: 'strong_debut',
      agentName: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      detail: `New agent earned $${parseFloat(r['revenue'] ?? '0').toFixed(2)} in first week`,
    });
  }

  // 5. Success rate divergence (ACP success_rate vs on-chain failed tx rate)
  const divergenceRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address,
      COALESCE(CAST(acp.success_rate AS numeric), 0) AS acp_success_rate,
      sub.onchain_success_rate
    FROM acp_agent_data acp
    LEFT JOIN agent_registry ar
      ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status != 'failed'))::numeric / COUNT(*)::numeric * 100, 1)
          ELSE NULL
        END AS onchain_success_rate
      FROM transactions t
      WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
        AND t.timestamp >= ${weekStart}::date
        AND t.timestamp < ${weekEnd}::date
    ) sub
    WHERE acp.success_rate IS NOT NULL
      AND sub.onchain_success_rate IS NOT NULL
      AND ABS(CAST(acp.success_rate AS numeric) - sub.onchain_success_rate) > 10
    ORDER BY ABS(CAST(acp.success_rate AS numeric) - sub.onchain_success_rate) DESC
    LIMIT 5
  `);

  for (const r of divergenceRows as unknown as Array<Record<string, string>>) {
    const acpRate = parseFloat(r['acp_success_rate'] ?? '0');
    const onchainRate = parseFloat(r['onchain_success_rate'] ?? '0');
    anomalies.push({
      type: 'success_rate_divergence',
      agentName: r['name'] ?? null,
      walletAddress: r['wallet_address'] ?? '',
      detail: `ACP success rate (${acpRate}%) diverges from on-chain (${onchainRate}%), gap: ${Math.abs(acpRate - onchainRate).toFixed(1)}%`,
    });
  }

  return anomalies;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 6: Quick Stats
// ═══════════════════════════════════════════════════════════════════════════════

async function buildQuickStats(weekStart: string, weekEnd: string): Promise<QuickStats> {
  const db = getDb();

  // Busiest hour
  const busiestRows = await db.execute(sql`
    SELECT
      TO_CHAR(timestamp, 'YYYY-MM-DD') AS day,
      EXTRACT(HOUR FROM timestamp) AS hour,
      COUNT(*) AS tx_count
    FROM transactions
    WHERE timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
      AND wallet_address IN (
        SELECT wallet_address FROM agent_registry WHERE is_observatory = true
      )
    GROUP BY day, hour
    ORDER BY tx_count DESC
    LIMIT 1
  `);
  const busiest = (busiestRows as unknown as Array<Record<string, string>>)[0];
  const busiestHour = busiest ? {
    day: busiest['day'] ?? '',
    hour: parseInt(busiest['hour'] ?? '0', 10),
    txCount: parseInt(busiest['tx_count'] ?? '0', 10),
  } : null;

  // Most expensive single tx
  const expensiveRows = await db.execute(sql`
    SELECT tx_hash, CAST(gas_cost_usd AS numeric) AS gas_cost_usd, wallet_address
    FROM transactions
    WHERE timestamp >= ${weekStart}::date
      AND timestamp < ${weekEnd}::date
      AND gas_cost_usd IS NOT NULL
      AND wallet_address IN (
        SELECT wallet_address FROM agent_registry WHERE is_observatory = true
      )
    ORDER BY CAST(gas_cost_usd AS numeric) DESC
    LIMIT 1
  `);
  const expensive = (expensiveRows as unknown as Array<Record<string, string>>)[0];
  const mostExpensiveTx = expensive ? {
    txHash: expensive['tx_hash'] ?? '',
    gasCostUsd: parseFloat(expensive['gas_cost_usd'] ?? '0'),
    walletAddress: expensive['wallet_address'] ?? '',
  } : null;

  // Longest idle agent (observatory agent with oldest last transaction)
  const idleRows = await db.execute(sql`
    SELECT
      ar.agent_name AS name,
      ar.wallet_address,
      MAX(t.timestamp) AS last_tx
    FROM agent_registry ar
    LEFT JOIN transactions t ON LOWER(t.wallet_address) = LOWER(ar.wallet_address)
    WHERE ar.is_observatory = true
    GROUP BY ar.id, ar.agent_name, ar.wallet_address
    HAVING MAX(t.timestamp) IS NOT NULL
    ORDER BY MAX(t.timestamp) ASC
    LIMIT 1
  `);
  const idle = (idleRows as unknown as Array<Record<string, string>>)[0];
  const longestIdleAgent = idle ? {
    name: idle['name'] ?? null,
    walletAddress: idle['wallet_address'] ?? '',
    lastTxDaysAgo: Math.floor((new Date(weekEnd).getTime() - new Date(idle['last_tx'] ?? '').getTime()) / (24 * 60 * 60 * 1000)),
  } : null;

  // Highest single-agent revenue
  const highRevRows = await db.execute(sql`
    SELECT name, CAST(revenue AS numeric) AS revenue
    FROM acp_agent_data
    WHERE revenue IS NOT NULL AND CAST(revenue AS numeric) > 0
    ORDER BY CAST(revenue AS numeric) DESC
    LIMIT 1
  `);
  const highRev = (highRevRows as unknown as Array<Record<string, string>>)[0];
  const highestRevenue = highRev ? {
    name: highRev['name'] ?? null,
    revenue: parseFloat(highRev['revenue'] ?? '0'),
  } : null;

  return { busiestHour, mostExpensiveTx, longestIdleAgent, highestRevenue };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Social Snippets
// ═══════════════════════════════════════════════════════════════════════════════

function buildSocialSnippets(
  headline: HeadlineNumbers,
  leaderboards: Leaderboards,
  spotlight: SpotlightData | null,
  quickStats: QuickStats,
  anomalies: AnomalyEntry[],
  weekStart: string,
): string[] {
  const link = 'chainward.ai/base/digest';
  const snippets: string[] = [];

  // 1. Headline snippet
  const headlineSnippet = `Base Agent Economy this week: $${headline.totalRevenue.toLocaleString()} revenue | ${headline.activeAgents} active agents | ${headline.totalJobs.toLocaleString()} jobs completed${headline.wow.revenueChange != null ? ` (${headline.wow.revenueChange > 0 ? '+' : ''}${headline.wow.revenueChange}% WoW)` : ''} | ${link}`;
  if (headlineSnippet.length <= 280) {
    snippets.push(headlineSnippet);
  } else {
    snippets.push(`Base agents: $${headline.totalRevenue.toLocaleString()} rev, ${headline.activeAgents} active, ${headline.totalJobs.toLocaleString()} jobs this week | ${link}`);
  }

  // 2. Most profitable leaderboard
  if (leaderboards.mostProfitable.length > 0) {
    const top3 = leaderboards.mostProfitable.slice(0, 3);
    const lines = top3.map((a, i) => `${i + 1}. ${(a.name ?? a.walletAddress.slice(0, 10)).slice(0, 20)}: $${a.profit.toFixed(0)}`).join('\n');
    const lbSnippet = `Most profitable Base agents this week:\n${lines}\n\nFull leaderboard: ${link}`;
    if (lbSnippet.length <= 280) {
      snippets.push(lbSnippet);
    }
  }

  // 3. Spotlight summary
  if (spotlight) {
    const spotSnippet = `Agent Spotlight: ${(spotlight.name ?? spotlight.walletAddress.slice(0, 10)).slice(0, 25)} - ${spotlight.notable}. ${spotlight.jobs.toLocaleString()} jobs, ${spotlight.margin}% margin | ${link}`;
    if (spotSnippet.length <= 280) {
      snippets.push(spotSnippet);
    } else {
      snippets.push(`Agent Spotlight: ${(spotlight.name ?? spotlight.walletAddress.slice(0, 10)).slice(0, 25)} - ${spotlight.notable} | ${link}`);
    }
  }

  // 4. Fun stat
  if (quickStats.busiestHour) {
    const funSnippet = `Busiest hour on Base: ${quickStats.busiestHour.day} ${quickStats.busiestHour.hour}:00 UTC with ${quickStats.busiestHour.txCount} agent txs. Most expensive single tx: $${quickStats.mostExpensiveTx?.gasCostUsd.toFixed(4) ?? '?'} gas | ${link}`;
    if (funSnippet.length <= 280) {
      snippets.push(funSnippet);
    }
  }

  // 5. Anomaly snippet (if any notable ones)
  const strongDebuts = anomalies.filter((a) => a.type === 'strong_debut');
  if (strongDebuts.length > 0) {
    const debut = strongDebuts[0]!;
    const debutSnippet = `New agent alert: ${(debut.agentName ?? debut.walletAddress.slice(0, 10)).slice(0, 25)} ${debut.detail.toLowerCase()} | ${link}`;
    if (debutSnippet.length <= 280) {
      snippets.push(debutSnippet);
    }
  }

  // 6. Net profit stat
  if (headline.netProfit > 0) {
    const profitSnippet = `Base agents earned $${headline.netProfit.toLocaleString()} net profit this week after $${headline.totalGas.toLocaleString()} in gas. ${headline.newAgents} new agents joined the economy | ${link}`;
    if (profitSnippet.length <= 280) {
      snippets.push(profitSnippet);
    }
  }

  // Ensure max 6 snippets, all within 280 chars
  return snippets.slice(0, 6).filter((s) => s.length <= 280);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main digest generator
// ═══════════════════════════════════════════════════════════════════════════════

async function generateWeeklyDigest() {
  const db = getDb();
  const { weekStart, weekEnd, priorWeekStart } = getPriorWeekBoundaries();

  logger.info({ weekStart, weekEnd, priorWeekStart }, 'Generating weekly digest');

  // Step 1: Snapshot current ACP data for this week
  await snapshotAcpData(weekStart);

  // Step 2: Build all sections
  const headline = await buildHeadline(weekStart, weekEnd, priorWeekStart);
  logger.info({ headline }, 'Headline numbers built');

  const leaderboards = await buildLeaderboards(weekStart, weekEnd, priorWeekStart);
  logger.info({ profitable: leaderboards.mostProfitable.length, efficient: leaderboards.mostEfficient.length }, 'Leaderboards built');

  const spotlight = await buildSpotlight(weekStart, weekEnd, priorWeekStart);
  logger.info({ spotlightAgent: spotlight?.name ?? 'none' }, 'Spotlight built');

  const protocolActivity = await buildProtocolActivity(weekStart, weekEnd);
  logger.info({ protocols: protocolActivity.length }, 'Protocol activity built');

  const alertsAnomalies = await buildAlertsAnomalies(weekStart, weekEnd, priorWeekStart);
  logger.info({ anomalies: alertsAnomalies.length }, 'Alerts & anomalies built');

  const quickStats = await buildQuickStats(weekStart, weekEnd);
  logger.info('Quick stats built');

  const socialSnippets = buildSocialSnippets(headline, leaderboards, spotlight, quickStats, alertsAnomalies, weekStart);
  logger.info({ count: socialSnippets.length }, 'Social snippets built');

  // Step 3: Assemble full digest
  const digestData = {
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    headline,
    leaderboards,
    spotlight,
    protocolActivity,
    alertsAnomalies,
    quickStats,
    socialSnippets,
  };

  // Step 4: Upsert into weekly_digests
  await db.execute(sql`
    INSERT INTO weekly_digests (
      week_start, week_end, digest_data, headline, leaderboards,
      spotlight, protocol_activity, alerts_anomalies, quick_stats, social_snippets
    ) VALUES (
      ${weekStart}::date,
      ${weekEnd}::date,
      ${JSON.stringify(digestData)}::jsonb,
      ${JSON.stringify(headline)}::jsonb,
      ${JSON.stringify(leaderboards)}::jsonb,
      ${JSON.stringify(spotlight)}::jsonb,
      ${JSON.stringify(protocolActivity)}::jsonb,
      ${JSON.stringify(alertsAnomalies)}::jsonb,
      ${JSON.stringify(quickStats)}::jsonb,
      ${JSON.stringify(socialSnippets)}::jsonb
    )
    ON CONFLICT (week_start) DO UPDATE SET
      week_end = EXCLUDED.week_end,
      digest_data = EXCLUDED.digest_data,
      headline = EXCLUDED.headline,
      leaderboards = EXCLUDED.leaderboards,
      spotlight = EXCLUDED.spotlight,
      protocol_activity = EXCLUDED.protocol_activity,
      alerts_anomalies = EXCLUDED.alerts_anomalies,
      quick_stats = EXCLUDED.quick_stats,
      social_snippets = EXCLUDED.social_snippets,
      generated_at = NOW()
  `);

  logger.info({ weekStart, weekEnd }, 'Weekly digest generated and stored');
  return digestData;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker setup
// ═══════════════════════════════════════════════════════════════════════════════

export function createDigestWorker() {
  const worker = new Worker<DigestJobData>(
    'digest',
    async (job: Job<DigestJobData>) => {
      switch (job.data.type) {
        case 'digest':
          await generateWeeklyDigest();
          break;
        case 'snapshot':
          const { weekStart } = getPriorWeekBoundaries();
          await snapshotAcpData(weekStart);
          break;
        default:
          logger.warn({ type: job.data.type }, 'Unknown digest job type');
      }
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Digest job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, type: job?.data?.type, err }, 'Digest job failed');
  });

  logger.info('Digest worker started');
  return worker;
}

export async function setupDigestSchedule(redis: import('ioredis').default) {
  const queue = new Queue('digest', { connection: redis });

  // Remove existing repeatable jobs
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Snapshot ACP data every Monday at 00:00 UTC (before digest generation)
  await queue.add('snapshot-acp', { type: 'snapshot' }, {
    repeat: { pattern: '0 0 * * 1' },
    jobId: 'acp-snapshot-repeatable',
  });

  // Generate digest every Monday at 01:00 UTC
  await queue.add('generate-digest', { type: 'digest' }, {
    repeat: { pattern: '0 1 * * 1' },
    jobId: 'weekly-digest-repeatable',
  });

  logger.info('Digest schedule configured (Monday 00:00 snapshot, Monday 01:00 digest)');
  await queue.close();
}
