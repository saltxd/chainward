import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { ObservatoryService } from '../services/observatoryService.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import type { AppVariables } from '../types.js';

let _service: ObservatoryService | null = null;
function getService(): ObservatoryService {
  if (!_service) _service = new ObservatoryService(getDb(), getRedis());
  return _service;
}

const observatory = new Hono<{ Variables: AppVariables }>();

// Public endpoints — 60 req/min per IP, no auth required
observatory.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:observatory' }));

observatory.get('/', async (c) => {
  const data = await getService().getOverview();
  return c.json({ success: true, data });
});

observatory.get('/feed', async (c) => {
  const data = await getService().getFeed();
  return c.json({ success: true, data });
});

observatory.get('/leaderboard', async (c) => {
  const data = await getService().getLeaderboard();
  return c.json({ success: true, data });
});

observatory.get('/trends', async (c) => {
  const data = await getService().getTrends();
  return c.json({ success: true, data });
});

observatory.get('/alerts', async (c) => {
  const data = await getService().getAlertActivity();
  return c.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACP Economics — enriched data combining ACP revenue with on-chain ops
// ═══════════════════════════════════════════════════════════════════════════════

observatory.get('/economics', async (c) => {
  const db = getDb();
  const redis = getRedis();
  const cached = await redis.get('obs:economics');
  if (cached) return c.json({ success: true, data: JSON.parse(cached) });

  // Ecosystem totals
  const ecoRows = await db.execute(sql`
    SELECT total_agdp, total_revenue, total_jobs, total_unique_wallets, captured_at
    FROM acp_ecosystem_metrics ORDER BY captured_at DESC LIMIT 1
  `);
  const eco = (ecoRows as unknown as Array<Record<string, unknown>>)[0] ?? null;

  // Top agents by revenue (ACP data merged with on-chain gas via virtualAgentId bridge)
  // ACP wallets ≠ observatory wallets, but they share a virtualAgentId
  const agentRows = await db.execute(sql`
    SELECT
      acp.name,
      acp.wallet_address AS acp_wallet,
      ar.wallet_address AS obs_wallet,
      acp.symbol,
      acp.has_graduated,
      acp.role,
      acp.profile_pic,
      COALESCE(acp.revenue, 0) AS revenue,
      COALESCE(acp.gross_agentic_amount, 0) AS agdp,
      COALESCE(acp.successful_job_count, 0) AS jobs,
      COALESCE(acp.success_rate, 0) AS success_rate,
      COALESCE(acp.unique_buyer_count, 0) AS unique_buyers,
      COALESCE(acp.is_online, false) AS is_online,
      COALESCE((
        SELECT SUM(CAST(t.gas_cost_usd AS numeric))
        FROM transactions t
        WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
          AND t.timestamp >= NOW() - INTERVAL '30 days'
      ), 0) AS gas_cost_30d,
      COALESCE(acp.revenue, 0) - COALESCE((
        SELECT SUM(CAST(t.gas_cost_usd AS numeric))
        FROM transactions t
        WHERE LOWER(t.wallet_address) = LOWER(COALESCE(ar.wallet_address, acp.wallet_address))
          AND t.timestamp >= NOW() - INTERVAL '30 days'
      ), 0) AS profit_30d
    FROM acp_agent_data acp
    LEFT JOIN agent_registry ar ON ar.registry_id = acp.virtual_agent_id::text
      AND ar.is_observatory = true
    WHERE acp.successful_job_count IS NOT NULL AND acp.successful_job_count > 0
    ORDER BY COALESCE(acp.revenue, 0) DESC
    LIMIT 50
  `);

  const data = {
    ecosystem: eco ? {
      totalAgdp: parseFloat(String(eco.total_agdp ?? '0')),
      totalRevenue: parseFloat(String(eco.total_revenue ?? '0')),
      totalJobs: Number(eco.total_jobs ?? 0),
      totalUniqueWallets: Number(eco.total_unique_wallets ?? 0),
      capturedAt: String(eco.captured_at),
    } : null,
    topAgents: (agentRows as unknown as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.name ?? ''),
      walletAddress: String(r.acp_wallet ?? ''),
      obsWalletAddress: r.obs_wallet != null ? String(r.obs_wallet) : null,
      symbol: r.symbol != null ? String(r.symbol) : null,
      hasGraduated: Boolean(r.has_graduated),
      role: r.role != null ? String(r.role) : null,
      profilePic: r.profile_pic != null ? String(r.profile_pic) : null,
      revenue: parseFloat(String(r.revenue ?? '0')),
      agdp: parseFloat(String(r.agdp ?? '0')),
      jobs: Number(r.jobs ?? 0),
      successRate: parseFloat(String(r.success_rate ?? '0')),
      uniqueBuyers: Number(r.unique_buyers ?? 0),
      isOnline: Boolean(r.is_online),
      gasCost30d: parseFloat(String(r.gas_cost_30d ?? '0')),
      profit30d: parseFloat(String(r.profit_30d ?? '0')),
    })),
  };

  await redis.set('obs:economics', JSON.stringify(data), 'EX', 600); // 10 min cache
  return c.json({ success: true, data });
});

observatory.get('/economics/:wallet', async (c) => {
  const db = getDb();
  const wallet = c.req.param('wallet');

  // Validate Ethereum address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return c.json({ success: false, error: 'Invalid wallet address format' }, 400);
  }

  const rows = await db.execute(sql`
    SELECT
      acp.name, acp.wallet_address, acp.symbol, acp.role, acp.profile_pic,
      acp.has_graduated, acp.is_online, acp.twitter_handle,
      COALESCE(acp.revenue, 0) AS revenue,
      COALESCE(acp.gross_agentic_amount, 0) AS agdp,
      COALESCE(acp.successful_job_count, 0) AS jobs,
      COALESCE(acp.success_rate, 0) AS success_rate,
      COALESCE(acp.unique_buyer_count, 0) AS unique_buyers,
      acp.offerings, acp.last_active_at
    FROM acp_agent_data acp
    WHERE LOWER(acp.wallet_address) = LOWER(${wallet})
    LIMIT 1
  `);

  if (!rows || (rows as unknown[]).length === 0) {
    return c.json({ success: false, error: 'Agent not found in ACP data' }, 404);
  }

  const r = (rows as unknown as Array<Record<string, unknown>>)[0]!;

  // Get on-chain gas costs
  const gasRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(gas_cost_usd AS numeric)), 0) AS gas_30d,
      COUNT(*) AS tx_count_30d,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_tx_30d
    FROM transactions
    WHERE LOWER(wallet_address) = LOWER(${wallet})
      AND timestamp >= NOW() - INTERVAL '30 days'
  `);
  const gas = (gasRows as unknown as Array<Record<string, unknown>>)[0] ?? {};

  const revenue = parseFloat(String(r.revenue ?? '0'));
  const gasCost = parseFloat(String(gas.gas_30d ?? '0'));

  return c.json({
    success: true,
    data: {
      name: String(r.name ?? ''),
      walletAddress: String(r.wallet_address),
      symbol: r.symbol != null ? String(r.symbol) : null,
      role: r.role != null ? String(r.role) : null,
      profilePic: r.profile_pic != null ? String(r.profile_pic) : null,
      hasGraduated: Boolean(r.has_graduated),
      isOnline: Boolean(r.is_online),
      twitterHandle: r.twitter_handle != null ? String(r.twitter_handle) : null,
      // ACP data
      revenue,
      agdp: parseFloat(String(r.agdp ?? '0')),
      jobs: Number(r.jobs ?? 0),
      successRate: parseFloat(String(r.success_rate ?? '0')),
      uniqueBuyers: Number(r.unique_buyers ?? 0),
      offerings: r.offerings,
      lastActiveAt: r.last_active_at != null ? String(r.last_active_at) : null,
      // On-chain data
      gasCost30d: gasCost,
      txCount30d: Number(gas.tx_count_30d ?? 0),
      failedTx30d: Number(gas.failed_tx_30d ?? 0),
      // Combined P&L
      profit30d: revenue - gasCost,
      gasEfficiency: gasCost > 0 ? revenue / gasCost : null,
    },
  });
});

observatory.get('/report', async (c) => {
  const db = getDb();
  const redis = getRedis();
  const cached = await redis.get('obs:report');
  if (cached) return c.json({ success: true, data: JSON.parse(cached) });

  // Top earners
  const earners = await db.execute(sql`
    SELECT name, wallet_address, COALESCE(revenue, 0) AS revenue,
           COALESCE(successful_job_count, 0) AS jobs, COALESCE(success_rate, 0) AS success_rate
    FROM acp_agent_data
    WHERE revenue IS NOT NULL AND CAST(revenue AS numeric) > 0
    ORDER BY CAST(revenue AS numeric) DESC LIMIT 10
  `);

  // Most active on-chain (7d)
  const active = await db.execute(sql`
    SELECT t.wallet_address, COALESCE(a.agent_name, acp.name, t.wallet_address) AS name,
           COUNT(*) AS tx_count,
           COALESCE(SUM(CAST(t.gas_cost_usd AS numeric)), 0) AS gas_usd
    FROM transactions t
    LEFT JOIN agent_registry a ON LOWER(a.wallet_address) = LOWER(t.wallet_address) AND a.is_observatory = true
    LEFT JOIN acp_agent_data acp ON LOWER(acp.wallet_address) = LOWER(t.wallet_address)
    WHERE t.timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY t.wallet_address, a.agent_name, acp.name
    ORDER BY tx_count DESC LIMIT 10
  `);

  // Ecosystem snapshot
  const eco = await db.execute(sql`
    SELECT total_agdp, total_revenue, total_jobs, total_unique_wallets
    FROM acp_ecosystem_metrics ORDER BY captured_at DESC LIMIT 1
  `);

  // Observatory stats
  const obsStats = await db.execute(sql`
    SELECT
      COUNT(DISTINCT wallet_address) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS active_agents_7d,
      COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS txs_7d,
      COALESCE(SUM(CAST(gas_cost_usd AS numeric)) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days'), 0) AS gas_7d
    FROM transactions
    WHERE wallet_address IN (SELECT wallet_address FROM agent_registry WHERE is_observatory = true)
  `);

  const ecoRow = (eco as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const statsRow = (obsStats as unknown as Array<Record<string, unknown>>)[0] ?? {};

  const data = {
    generatedAt: new Date().toISOString(),
    period: '7d',
    ecosystem: {
      totalAgdp: parseFloat(String(ecoRow.total_agdp ?? '0')),
      totalRevenue: parseFloat(String(ecoRow.total_revenue ?? '0')),
      totalJobs: Number(ecoRow.total_jobs ?? 0),
      totalUniqueWallets: Number(ecoRow.total_unique_wallets ?? 0),
    },
    observatory: {
      activeAgents7d: Number(statsRow.active_agents_7d ?? 0),
      transactions7d: Number(statsRow.txs_7d ?? 0),
      gasBurned7d: parseFloat(String(statsRow.gas_7d ?? '0')),
    },
    topEarners: (earners as unknown as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.name ?? ''),
      walletAddress: String(r.wallet_address),
      revenue: parseFloat(String(r.revenue ?? '0')),
      jobs: Number(r.jobs ?? 0),
      successRate: parseFloat(String(r.success_rate ?? '0')),
    })),
    mostActive: (active as unknown as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.name ?? ''),
      walletAddress: String(r.wallet_address),
      txCount: Number(r.tx_count ?? 0),
      gasUsd: parseFloat(String(r.gas_usd ?? '0')),
    })),
  };

  await redis.set('obs:report', JSON.stringify(data), 'EX', 3600); // 1 hour cache
  return c.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Candidates — auth required, for reviewing ERC-8004 scout results
// ═══════════════════════════════════════════════════════════════════════════════

observatory.get('/candidates', requireApiKeyOrSession(), async (c) => {
  const db = getDb();
  const rawStatus = c.req.query('status') ?? 'pending';
  const validStatuses = ['pending', 'approved', 'dismissed'] as const;
  const status = validStatuses.includes(rawStatus as typeof validStatuses[number])
    ? rawStatus
    : 'pending';

  const rows = await db.execute(sql`
    SELECT id, chain, wallet_address, agent_name, registry_token_id,
           registry_owner, token_uri, tx_count, balance_eth, status, notes, discovered_at
    FROM observatory_candidates
    WHERE status = ${status}
    ORDER BY tx_count DESC
    LIMIT 100
  `);

  return c.json({ success: true, data: rows });
});

observatory.patch('/candidates/:id', requireApiKeyOrSession('admin'), async (c) => {
  const db = getDb();
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{ status: 'approved' | 'dismissed'; notes?: string }>();

  if (!['approved', 'dismissed'].includes(body.status)) {
    return c.json({ success: false, error: 'status must be approved or dismissed' }, 400);
  }

  await db.execute(sql`
    UPDATE observatory_candidates
    SET status = ${body.status},
        notes = COALESCE(${body.notes ?? null}, notes),
        reviewed_at = NOW()
    WHERE id = ${id}
  `);

  return c.json({ success: true });
});

export { observatory };
