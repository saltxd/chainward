import { sql, eq, and } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import { SPAM_TOKENS } from '@chainward/common';
import type IORedis from 'ioredis';

const spamList = [...SPAM_TOKENS];

const spamExclusion =
  spamList.length > 0
    ? sql`AND (token_address IS NULL OR token_address NOT IN (${sql.join(spamList.map((s) => sql`${s}`), sql`, `)}))`
    : sql``;

export class ObservatoryService {
  constructor(
    private db: Database,
    private redis: IORedis,
  ) {}

  // ── Cache helper ──────────────────────────────────────────────────────

  private async cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit);
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

  async getOverview() {
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
          COALESCE(SUM(gas_cost_native) FILTER (WHERE timestamp >= ${dayAgo}::timestamptz), 0) AS gas_eth_24h,
          COALESCE(SUM(gas_cost_usd)    FILTER (WHERE timestamp >= ${dayAgo}::timestamptz), 0) AS gas_usd_24h,
          COALESCE(SUM(gas_cost_native) FILTER (WHERE timestamp >= ${weekAgo}::timestamptz), 0) AS gas_eth_7d,
          COALESCE(SUM(gas_cost_usd)    FILTER (WHERE timestamp >= ${weekAgo}::timestamptz), 0) AS gas_usd_7d,
          COALESCE(SUM(gas_cost_native), 0) AS gas_eth_30d,
          COALESCE(SUM(gas_cost_usd),    0) AS gas_usd_30d,
          COUNT(DISTINCT wallet_address) FILTER (WHERE timestamp >= ${dayAgo}::timestamptz) AS active_24h
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
      for (const row of balanceRows as unknown as Array<{ balance_usd: string }>) {
        totalPortfolioValue += parseFloat(row.balance_usd ?? '0');
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
        totalAgents: agentsTracked,
        updatedAt: now.toISOString(),
      };
    });
  }

  // ── 2. Feed ───────────────────────────────────────────────────────────

  async getFeed() {
    return this.cached('obs:feed', 60, async () => {
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
          AND (COALESCE(t.amount_usd, 0) > 0 OR COALESCE(t.gas_cost_usd, 0) > 0)
          ${spamExclusion}
        ORDER BY t.timestamp DESC
        LIMIT 20
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
    });
  }

  // ── 3. Leaderboard ────────────────────────────────────────────────────

  async getLeaderboard() {
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
          COUNT(*) AS tx_count
        FROM transactions t
        LEFT JOIN agent_registry a ON a.wallet_address = t.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        WHERE t.wallet_address = ANY(${walletArray}::text[])
          AND t.timestamp >= ${weekAgo}::timestamptz
          ${spamExclusion}
        GROUP BY t.wallet_address, a.agent_name, a.agent_framework
        ORDER BY tx_count DESC
        LIMIT 10
      `);

      const mostActive = (mostActiveRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        txCount: parseInt(String(r.tx_count), 10),
        rank: i + 1,
      }));

      // Highest gas — top 10 by gas spend (7d)
      const highestGasRows = await this.db.execute(sql`
        SELECT
          t.wallet_address,
          COALESCE(a.agent_name, t.wallet_address) AS agent_name,
          a.agent_framework,
          COALESCE(SUM(t.gas_cost_usd), 0) AS gas_spend_usd
        FROM transactions t
        LEFT JOIN agent_registry a ON a.wallet_address = t.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        WHERE t.wallet_address = ANY(${walletArray}::text[])
          AND t.timestamp >= ${weekAgo}::timestamptz
          ${spamExclusion}
        GROUP BY t.wallet_address, a.agent_name, a.agent_framework
        ORDER BY gas_spend_usd DESC
        LIMIT 10
      `);

      const highestGas = (highestGasRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
        gasSpendUsd: parseFloat(String(r.gas_spend_usd ?? '0')),
        rank: i + 1,
      }));

      // Largest portfolio — top 10 by latest native balance
      const portfolioRows = await this.db.execute(sql`
        SELECT
          bs.wallet_address,
          COALESCE(a.agent_name, bs.wallet_address) AS agent_name,
          a.agent_framework,
          bs.balance_usd AS portfolio_value_usd
        FROM (
          SELECT DISTINCT ON (wallet_address) wallet_address, balance_usd
          FROM balance_snapshots
          WHERE wallet_address = ANY(${walletArray}::text[])
            AND token_address IS NULL
          ORDER BY wallet_address, timestamp DESC
        ) bs
        LEFT JOIN agent_registry a ON a.wallet_address = bs.wallet_address
          AND a.is_observatory = true AND a.is_public = true
        ORDER BY bs.balance_usd::numeric DESC
        LIMIT 10
      `);

      const largestPortfolio = (portfolioRows as unknown as Array<Record<string, unknown>>).map((r, i) => ({
        walletAddress: String(r.wallet_address),
        agentName: String(r.agent_name),
        agentFramework: r.agent_framework != null ? String(r.agent_framework) : null,
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
        healthScore: parseInt(String(r.health_score), 10),
        uptimePct: parseFloat(String(r.uptime_pct ?? '0')),
        gasEfficiency: parseFloat(String(r.gas_efficiency ?? '0')),
        failureRate: parseFloat(String(r.failure_rate ?? '0')),
        consistency: parseFloat(String(r.consistency ?? '0')),
        rank: i + 1,
      }));

      return { mostActive, highestGas, largestPortfolio, healthiest };
    });
  }

  // ── 4. Trends ─────────────────────────────────────────────────────────

  async getTrends() {
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
          COALESCE(SUM(gas_cost_usd), 0) AS gas_usd,
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
    });
  }

  // ── 5. Alert activity ─────────────────────────────────────────────────

  async getAlertActivity() {
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
    });
  }
}
