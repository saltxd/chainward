import { sql, eq, and } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import type IORedis from 'ioredis';
import { spamExclusionSql as spamExclusion } from '../lib/spamFilter.js';

export class ObservatoryService {
  constructor(
    private db: Database,
    private redis: IORedis,
  ) {}

  // ── Cache helper ──────────────────────────────────────────────────────

  private async cached<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
    force = false,
  ): Promise<T> {
    if (!force) {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit);
    }
    const data = await fn();
    await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
    return data;
  }

  // ── Private: observatory wallet addresses ─────────────────────────────

  private async getObservatoryWallets(): Promise<string[]> {
    return this.cached('obs:wallets', 60, async () => {
      const agents = await this.db
        .select({ walletAddress: agentRegistry.walletAddress })
        .from(agentRegistry)
        .where(and(eq(agentRegistry.isObservatory, true), eq(agentRegistry.isPublic, true)));

      return agents.map((a) => a.walletAddress);
    });
  }

  // ── 1. Overview ───────────────────────────────────────────────────────

  async getOverview(opts: { force?: boolean } = {}) {
    return this.cached('obs:overview', 300, async () => {
      const wallets = await this.getObservatoryWallets();
      const agentsTracked = wallets.length;

      if (agentsTracked === 0) {
        return {
          agentsTracked: 0,
          transactions24h: 0,
          transactions7d: 0,
          transactions30d: 0,
          gasBurned24h: { eth: 0, usd: 0 },
          gasBurned7d: { eth: 0, usd: 0 },
          gasBurned30d: { eth: 0, usd: 0 },
          totalPortfolioValue: 0,
          activeAgents24h: 0,
          activeAgents7d: 0,
          totalAgents: 0,
          updatedAt: new Date().toISOString(),
        };
      }

      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const walletArray = `{${wallets.join(',')}}`;

      // Tx counts + gas at three horizons (single query)
      const statsRows = await this.db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE timestamp >= ${dayAgo}::timestamptz) AS tx_24h,
          COUNT(*) FILTER (WHERE timestamp >= ${weekAgo}::timestamptz) AS tx_7d,
          COUNT(*) AS tx_30d,
          COALESCE(SUM(CAST(gas_cost_native AS numeric)) FILTER (WHERE timestamp >= ${dayAgo}::timestamptz), 0) AS gas_eth_24h,
          COALESCE(SUM(CAST(gas_cost_usd AS numeric))    FILTER (WHERE timestamp >= ${dayAgo}::timestamptz), 0) AS gas_usd_24h,
          COALESCE(SUM(CAST(gas_cost_native AS numeric)) FILTER (WHERE timestamp >= ${weekAgo}::timestamptz), 0) AS gas_eth_7d,
          COALESCE(SUM(CAST(gas_cost_usd AS numeric))    FILTER (WHERE timestamp >= ${weekAgo}::timestamptz), 0) AS gas_usd_7d,
          COALESCE(SUM(CAST(gas_cost_native AS numeric)), 0) AS gas_eth_30d,
          COALESCE(SUM(CAST(gas_cost_usd AS numeric)),    0) AS gas_usd_30d,
          COUNT(DISTINCT wallet_address) FILTER (WHERE timestamp >= ${dayAgo}::timestamptz) AS active_24h,
          COUNT(DISTINCT wallet_address) FILTER (WHERE timestamp >= ${weekAgo}::timestamptz) AS active_7d
        FROM transactions
        WHERE wallet_address = ANY(${walletArray}::text[])
          AND timestamp >= ${monthAgo}::timestamptz
          ${spamExclusion}
      `);

      const s = (statsRows as unknown as Array<Record<string, string>>)[0] ?? {};

      // Latest native balance per wallet
      const balanceRows = await this.db.execute(sql`
        SELECT DISTINCT ON (wallet_address) wallet_address, balance_usd
        FROM balance_snapshots
        WHERE wallet_address = ANY(${walletArray}::text[])
          AND token_address IS NULL
        ORDER BY wallet_address, timestamp DESC
      `);

      let totalPortfolioValue = 0;
      for (const row of balanceRows as unknown as Array<{ balance_usd: string | null }>) {
        totalPortfolioValue += parseFloat(String(row.balance_usd ?? '0'));
      }

      return {
        agentsTracked,
        transactions24h: parseInt(s.tx_24h ?? '0', 10),
        transactions7d: parseInt(s.tx_7d ?? '0', 10),
        transactions30d: parseInt(s.tx_30d ?? '0', 10),
        gasBurned24h: { eth: parseFloat(s.gas_eth_24h ?? '0'), usd: parseFloat(s.gas_usd_24h ?? '0') },
        gasBurned7d: { eth: parseFloat(s.gas_eth_7d ?? '0'), usd: parseFloat(s.gas_usd_7d ?? '0') },
        gasBurned30d: { eth: parseFloat(s.gas_eth_30d ?? '0'), usd: parseFloat(s.gas_usd_30d ?? '0') },
        totalPortfolioValue,
        activeAgents24h: parseInt(s.active_24h ?? '0', 10),
        activeAgents7d: parseInt(s.active_7d ?? '0', 10),
        totalAgents: agentsTracked,
        updatedAt: now.toISOString(),
      };
    }, opts.force);
  }

  // ── 2. Feed ───────────────────────────────────────────────────────────

  async getFeed(opts: { force?: boolean } = {}) {
    return this.cached('obs:feed', 300, async () => {
      const wallets = await this.getObservatoryWallets();
      if (wallets.length === 0) return [];

      const walletArray = `{${wallets.join(',')}}`;

      const rows = await this.db.execute(sql`
        SELECT
          t.timestamp,
          COALESCE(a.agent_name, t.wallet_address) AS agent_name,
          t.wallet_address,
          t.direction,
          t.token_symbol,
          COALESCE(t.amount_usd, 0) AS amount_usd,
          COALESCE(t.gas_cost_usd, 0) AS gas_cost_usd,
          t.tx_hash,
          t.tx_type,
          t.status
        FROM transactions t
        LEFT JOIN agent_registry a ON a.wallet_address = t.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        WHERE t.wallet_address = ANY(${walletArray}::text[])
          AND (t.amount_usd IS NULL OR CAST(t.amount_usd AS numeric) >= 0)
          ${spamExclusion}
        ORDER BY t.timestamp DESC
        LIMIT 10
      `);

      return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
        timestamp: String(r.timestamp),
        agentName: String(r.agent_name),
        walletAddress: String(r.wallet_address),
        direction: String(r.direction),
        tokenSymbol: r.token_symbol != null ? String(r.token_symbol) : null,
        amountUsd: parseFloat(String(r.amount_usd ?? '0')),
        gasCostUsd: parseFloat(String(r.gas_cost_usd ?? '0')),
        txHash: String(r.tx_hash),
        txType: String(r.tx_type ?? 'unknown'),
        status: String(r.status),
      }));
    }, opts.force);
  }

  // ── 3. Leaderboard ────────────────────────────────────────────────────

  async getLeaderboard(opts: { force?: boolean } = {}) {
    return this.cached('obs:leaderboard', 900, async () => {
      const wallets = await this.getObservatoryWallets();
      if (wallets.length === 0) {
        return { mostActive: [], highestGas: [], largestPortfolio: [], healthiest: [] };
      }

      const walletArray = `{${wallets.join(',')}}`;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Most active — top 10 by tx count (7d)
      const mostActiveRows = await this.db.execute(sql`
        SELECT
          t.wallet_address,
          COALESCE(a.agent_name, t.wallet_address) AS agent_name,
          a.agent_framework,
          a.slug,
          COUNT(*) AS tx_count
        FROM transactions t
        LEFT JOIN agent_registry a ON a.wallet_address = t.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        WHERE t.wallet_address = ANY(${walletArray}::text[])
          AND t.timestamp >= ${weekAgo}::timestamptz
          ${spamExclusion}
        GROUP BY t.wallet_address, a.agent_name, a.agent_framework, a.slug
        ORDER BY tx_count DESC
        LIMIT 10
      `);

      const mostActive = (mostActiveRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        slug: String(r.slug),
        txCount: parseInt(String(r.tx_count), 10),
        rank: i + 1,
      }));

      // Highest gas — top 10 by gas spend (7d)
      const highestGasRows = await this.db.execute(sql`
        SELECT
          t.wallet_address,
          COALESCE(a.agent_name, t.wallet_address) AS agent_name,
          a.agent_framework,
          a.slug,
          COALESCE(SUM(CAST(t.gas_cost_usd AS numeric)), 0) AS gas_spend_usd
        FROM transactions t
        LEFT JOIN agent_registry a ON a.wallet_address = t.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        WHERE t.wallet_address = ANY(${walletArray}::text[])
          AND t.timestamp >= ${weekAgo}::timestamptz
          ${spamExclusion}
        GROUP BY t.wallet_address, a.agent_name, a.agent_framework, a.slug
        ORDER BY gas_spend_usd DESC
        LIMIT 10
      `);

      const highestGas = (highestGasRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        slug: String(r.slug),
        gasSpendUsd: parseFloat(String(r.gas_spend_usd ?? '0')),
        rank: i + 1,
      }));

      // Largest portfolio — top 10 by latest native balance
      const portfolioRows = await this.db.execute(sql`
        SELECT
          bs.wallet_address,
          COALESCE(a.agent_name, bs.wallet_address) AS agent_name,
          a.agent_framework,
          a.slug,
          COALESCE(CAST(bs.balance_usd AS numeric), 0) AS portfolio_value_usd
        FROM (
          SELECT DISTINCT ON (wallet_address) wallet_address, balance_usd
          FROM balance_snapshots
          WHERE wallet_address = ANY(${walletArray}::text[])
            AND token_address IS NULL
          ORDER BY wallet_address, timestamp DESC
        ) bs
        LEFT JOIN agent_registry a ON a.wallet_address = bs.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        ORDER BY portfolio_value_usd DESC
        LIMIT 10
      `);

      const largestPortfolio = (portfolioRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        slug: String(r.slug),
        portfolioValueUsd: parseFloat(String(r.portfolio_value_usd ?? '0')),
        rank: i + 1,
      }));

      // Healthiest — top 10 by latest health score
      const healthRows = await this.db.execute(sql`
        SELECT
          h.agent_id,
          a.wallet_address,
          COALESCE(a.agent_name, a.wallet_address) AS agent_name,
          a.agent_framework,
          a.slug,
          h.score AS health_score,
          h.uptime_pct,
          h.gas_efficiency,
          h.failure_rate,
          h.consistency
        FROM daily_agent_health h
        JOIN agent_registry a ON a.id = h.agent_id
        WHERE a.wallet_address = ANY(${walletArray}::text[])
          AND a.is_observatory = true AND a.is_public = true
          AND h.date = (SELECT MAX(date) FROM daily_agent_health)
        ORDER BY h.score DESC
        LIMIT 10
      `);

      const healthiest = (healthRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        slug: String(r.slug),
        healthScore: parseInt(String(r.health_score), 10),
        uptimePct: parseFloat(String(r.uptime_pct ?? '0')),
        gasEfficiency: parseFloat(String(r.gas_efficiency ?? '0')),
        failureRate: parseFloat(String(r.failure_rate ?? '0')),
        consistency: parseFloat(String(r.consistency ?? '0')),
        rank: i + 1,
      }));

      return { mostActive, highestGas, largestPortfolio, healthiest };
    }, opts.force);
  }

  // ── 4. Trends ─────────────────────────────────────────────────────────

  async getTrends(opts: { force?: boolean } = {}) {
    return this.cached('obs:trends', 1800, async () => {
      const wallets = await this.getObservatoryWallets();
      if (wallets.length === 0) {
        return {
          dailyTxCount: [],
          dailyGasSpend: [],
          dailyActiveAgents: [],
          avgTxPerAgentPerDay: 0,
        };
      }

      const walletArray = `{${wallets.join(',')}}`;
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const rows = await this.db.execute(sql`
        SELECT
          time_bucket('1 day', timestamp) AS day,
          COUNT(*) AS tx_count,
          COALESCE(SUM(CAST(gas_cost_usd AS numeric)), 0) AS gas_usd,
          COUNT(DISTINCT wallet_address) AS active_agents
        FROM transactions
        WHERE wallet_address = ANY(${walletArray}::text[])
          AND timestamp >= ${monthAgo}::timestamptz
          ${spamExclusion}
        GROUP BY day
        ORDER BY day ASC
      `);

      const typed = rows as unknown as Array<{
        day: string;
        tx_count: string;
        gas_usd: string;
        active_agents: string;
      }>;

      const dailyTxCount = typed.map((r) => ({
        date: String(r.day),
        count: parseInt(r.tx_count, 10),
      }));

      const dailyGasSpend = typed.map((r) => ({
        date: String(r.day),
        gasUsd: parseFloat(r.gas_usd),
      }));

      const dailyActiveAgents = typed.map((r) => ({
        date: String(r.day),
        count: parseInt(r.active_agents, 10),
      }));

      // Average tx per agent per day
      const totalTx = dailyTxCount.reduce((acc, d) => acc + d.count, 0);
      const days = dailyTxCount.length || 1;
      const agentCount = wallets.length || 1;
      const avgTxPerAgentPerDay = parseFloat((totalTx / days / agentCount).toFixed(2));

      return { dailyTxCount, dailyGasSpend, dailyActiveAgents, avgTxPerAgentPerDay };
    }, opts.force);
  }

  // ── 5. Alert activity ─────────────────────────────────────────────────

  async getAlertActivity(opts: { force?: boolean } = {}) {
    return this.cached('obs:alerts', 900, async () => {
      const wallets = await this.getObservatoryWallets();
      if (wallets.length === 0) {
        return { alertsFiredThisWeek: 0, alertsByType: [] };
      }

      const walletArray = `{${wallets.join(',')}}`;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const rows = await this.db.execute(sql`
        SELECT
          alert_type,
          COUNT(*) AS cnt
        FROM alert_events
        WHERE wallet_address = ANY(${walletArray}::text[])
          AND timestamp >= ${weekAgo}::timestamptz
        GROUP BY alert_type
        ORDER BY cnt DESC
      `);

      const typed = rows as unknown as Array<{ alert_type: string; cnt: string }>;

      const alertsByType = typed.map((r) => ({
        alertType: r.alert_type,
        count: parseInt(r.cnt, 10),
      }));

      const alertsFiredThisWeek = alertsByType.reduce((acc, r) => acc + r.count, 0);

      return { alertsFiredThisWeek, alertsByType };
    }, opts.force);
  }

  // ── 6. Agent detail ───────────────────────────────────────────────────

  async getAgentDetail(slug: string, opts: { force?: boolean } = {}) {
    return this.cached(`obs:agent:${slug}`, 120, async () => {
      // 1. Resolve slug → agent
      const agentRows = await this.db.execute(sql`
        SELECT id, wallet_address, slug, agent_name, agent_framework,
               twitter_handle, project_url, registry_source, acp_agent_id, first_seen_at
        FROM agent_registry
        WHERE chain = 'base' AND slug = ${slug} AND is_observatory = true AND is_public = true
        LIMIT 1
      `);
      const agent = (agentRows as unknown as Array<Record<string, unknown>>)[0];
      if (!agent) return null;

      const wallet = String(agent.wallet_address);
      const agentId = Number(agent.id);

      // 2-5. Once the agent is resolved, the four downstream queries are
      // independent — run them concurrently to cut detail-page latency.
      const [healthRows, balanceRows, txRows, acpRows] = await Promise.all([
        // 2. Latest health score + breakdown
        this.db.execute(sql`
          SELECT score, uptime_pct, gas_efficiency, failure_rate, consistency, date
          FROM daily_agent_health
          WHERE agent_id = ${agentId}
          ORDER BY date DESC
          LIMIT 1
        `),

        // 3. 30-day daily balance series. balance_snapshots only stores raw +
        // USD; we don't carry a separate native column. The chart uses USD.
        this.db.execute(sql`
          SELECT
            time_bucket('1 day', timestamp) AS day,
            AVG(CAST(balance_usd AS numeric))::float AS balance_usd
          FROM balance_snapshots
          WHERE LOWER(wallet_address) = LOWER(${wallet})
            AND token_address IS NULL
            AND timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY day
          ORDER BY day ASC
        `),

        // 4. Last 50 transactions
        this.db.execute(sql`
          SELECT timestamp, direction, token_symbol, amount_usd, gas_cost_usd,
                 tx_hash, tx_type, status
          FROM transactions
          WHERE LOWER(wallet_address) = LOWER(${wallet})
          ORDER BY timestamp DESC
          LIMIT 50
        `),

        // 5. ACP economics (if linked)
        agent.acp_agent_id
          ? this.db.execute(sql`
              SELECT name, symbol, role, profile_pic, has_graduated, is_online,
                     revenue, gross_agentic_amount AS agdp,
                     successful_job_count AS jobs, success_rate, unique_buyer_count
              FROM acp_agent_data
              WHERE virtual_agent_id = ${agent.acp_agent_id}
              LIMIT 1
            `)
          : Promise.resolve([] as unknown as ReturnType<typeof this.db.execute>),
      ]);

      const health = (healthRows as unknown as Array<Record<string, unknown>>)[0] ?? null;
      const acp = (acpRows as unknown as Array<Record<string, unknown>>)[0] ?? null;

      return {
        slug: String(agent.slug),
        walletAddress: wallet,
        agentName: agent.agent_name != null ? String(agent.agent_name) : null,
        agentFramework: agent.agent_framework != null ? String(agent.agent_framework) : null,
        twitterHandle: agent.twitter_handle != null ? String(agent.twitter_handle) : null,
        projectUrl: agent.project_url != null ? String(agent.project_url) : null,
        registrySource: String(agent.registry_source),
        firstSeenAt: String(agent.first_seen_at),
        health: health ? {
          score: Number(health.score),
          uptimePct: parseFloat(String(health.uptime_pct ?? '0')),
          gasEfficiency: parseFloat(String(health.gas_efficiency ?? '0')),
          failureRate: parseFloat(String(health.failure_rate ?? '0')),
          consistency: parseFloat(String(health.consistency ?? '0')),
          date: String(health.date),
        } : null,
        balanceSeries: (balanceRows as unknown as Array<Record<string, unknown>>).map((r) => ({
          date: String(r.day),
          balanceUsd: r.balance_usd != null ? Number(r.balance_usd) : null,
        })),
        transactions: (txRows as unknown as Array<Record<string, unknown>>).map((r) => ({
          timestamp: String(r.timestamp),
          direction: String(r.direction),
          tokenSymbol: r.token_symbol != null ? String(r.token_symbol) : null,
          amountUsd: parseFloat(String(r.amount_usd ?? '0')),
          gasCostUsd: parseFloat(String(r.gas_cost_usd ?? '0')),
          txHash: String(r.tx_hash),
          txType: r.tx_type != null ? String(r.tx_type) : 'unknown',
          status: String(r.status),
        })),
        acp: acp ? {
          name: String(acp.name ?? ''),
          symbol: acp.symbol != null ? String(acp.symbol) : null,
          role: acp.role != null ? String(acp.role) : null,
          profilePic: acp.profile_pic != null ? String(acp.profile_pic) : null,
          hasGraduated: Boolean(acp.has_graduated),
          isOnline: Boolean(acp.is_online),
          revenue: parseFloat(String(acp.revenue ?? '0')),
          agdp: parseFloat(String(acp.agdp ?? '0')),
          jobs: Number(acp.jobs ?? 0),
          successRate: parseFloat(String(acp.success_rate ?? '0')),
          uniqueBuyers: Number(acp.unique_buyer_count ?? 0),
        } : null,
      };
    }, opts.force);
  }

  // ── 7. ACP economics ──────────────────────────────────────────────────

  async getEconomics(opts: { force?: boolean } = {}) {
    return this.cached('obs:economics', 600, async () => {
      const ecoRows = await this.db.execute(sql`
        SELECT total_agdp, total_revenue, total_jobs, total_unique_wallets, captured_at
        FROM acp_ecosystem_metrics ORDER BY captured_at DESC LIMIT 1
      `);
      const eco = (ecoRows as unknown as Array<Record<string, unknown>>)[0] ?? null;

      const agentRows = await this.db.execute(sql`
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
            WHERE LOWER(t.wallet_address) = LOWER(ar.wallet_address)
              AND t.timestamp >= NOW() - INTERVAL '30 days'
          ), 0) AS gas_cost_30d,
          COALESCE(acp.revenue, 0) - COALESCE((
            SELECT SUM(CAST(t.gas_cost_usd AS numeric))
            FROM transactions t
            WHERE LOWER(t.wallet_address) = LOWER(ar.wallet_address)
              AND t.timestamp >= NOW() - INTERVAL '30 days'
          ), 0) AS profit_30d
        FROM acp_agent_data acp
        LEFT JOIN agent_registry ar ON ar.registry_id = acp.virtual_agent_id::text
          AND ar.is_observatory = true
        WHERE acp.successful_job_count IS NOT NULL AND acp.successful_job_count > 0
        ORDER BY COALESCE(acp.revenue, 0) DESC
        LIMIT 50
      `);

      return {
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
    }, opts.force);
  }

  // ── 8. Ecosystem report ───────────────────────────────────────────────

  async getReport(opts: { force?: boolean } = {}) {
    return this.cached('obs:report', 3600, async () => {
      const earners = await this.db.execute(sql`
        SELECT name, wallet_address, COALESCE(revenue, 0) AS revenue,
               COALESCE(successful_job_count, 0) AS jobs, COALESCE(success_rate, 0) AS success_rate
        FROM acp_agent_data
        WHERE revenue IS NOT NULL AND CAST(revenue AS numeric) > 0
        ORDER BY CAST(revenue AS numeric) DESC LIMIT 10
      `);

      const active = await this.db.execute(sql`
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

      const eco = await this.db.execute(sql`
        SELECT total_agdp, total_revenue, total_jobs, total_unique_wallets
        FROM acp_ecosystem_metrics ORDER BY captured_at DESC LIMIT 1
      `);

      const obsStats = await this.db.execute(sql`
        SELECT
          COUNT(DISTINCT wallet_address) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS active_agents_7d,
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS txs_7d,
          COALESCE(SUM(CAST(gas_cost_usd AS numeric)) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days'), 0) AS gas_7d
        FROM transactions
        WHERE wallet_address IN (SELECT wallet_address FROM agent_registry WHERE is_observatory = true)
      `);

      const ecoRow = (eco as unknown as Array<Record<string, unknown>>)[0] ?? {};
      const statsRow = (obsStats as unknown as Array<Record<string, unknown>>)[0] ?? {};

      return {
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
    }, opts.force);
  }

  // ── Cache warmer entry point ──────────────────────────────────────────

  async refreshAll(): Promise<void> {
    // Warm all routes the public observatory pages hit. Run in parallel —
    // DB queries are async I/O, won't starve the event loop. Each call
    // forces a fresh compute and updates Redis.
    await Promise.all([
      this.getOverview({ force: true }),
      this.getFeed({ force: true }),
      this.getLeaderboard({ force: true }),
      this.getTrends({ force: true }),
      this.getAlertActivity({ force: true }),
      this.getEconomics({ force: true }),
      this.getReport({ force: true }),
    ]);
  }
}
