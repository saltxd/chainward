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
  const data = await getService().getEconomics();
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
  const data = await getService().getReport();
  return c.json({ success: true, data });
});

observatory.get('/agent/:slug', async (c) => {
  const slug = c.req.param('slug');

  if (!/^[a-z0-9][a-z0-9-]{0,59}$/i.test(slug)) {
    return c.json({ success: false, error: 'invalid slug' }, 400);
  }

  const data = await getService().getAgentDetail(slug);
  if (!data) return c.json({ success: false, error: 'agent not found' }, 404);

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
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'id must be a number' }, 400);
  }
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
