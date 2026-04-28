import { eq, sql, and, gte, count, sum, inArray } from 'drizzle-orm';
import { agentRegistry, transactions, balanceSnapshots } from '@chainward/db';
import type { Database } from '@chainward/db';
import { spamFilter } from '../lib/spamFilter.js';

export class StatsService {
  constructor(private db: Database) {}

  async getOverview(userId: string) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Agent count
    const [agentCount] = await this.db
      .select({ total: count() })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    // 24h tx count + gas spend
    const agents = await this.db
      .select({ walletAddress: agentRegistry.walletAddress })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    const wallets = agents.map((a) => a.walletAddress);

    let txCount24h = 0;
    let gasSpend24h = 0;
    let totalValue = 0;

    if (wallets.length > 0) {
      const spam = spamFilter();

      const [txStats] = await this.db
        .select({
          txCount: count(),
          totalGas: sum(transactions.gasCostUsd),
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.walletAddress, wallets),
            gte(transactions.timestamp, dayAgo),
            spam,
          ),
        );

      txCount24h = txStats?.txCount ?? 0;
      gasSpend24h = parseFloat(txStats?.totalGas ?? '0');

      // Latest balance per wallet (most recent snapshot per wallet)
      const walletArray = `{${wallets.join(',')}}`;
      const latestBalances = await this.db.execute(sql`
        SELECT DISTINCT ON (wallet_address) wallet_address, balance_usd
        FROM balance_snapshots
        WHERE wallet_address = ANY(${walletArray}::text[])
          AND token_address IS NULL
        ORDER BY wallet_address, timestamp DESC
      `);

      for (const row of latestBalances as unknown as Array<{ balance_usd: string }>) {
        totalValue += parseFloat(row.balance_usd ?? '0');
      }
    }

    return {
      agents: {
        total: agentCount?.total ?? 0,
      },
      transactions24h: txCount24h,
      gasSpend24h,
      totalValue,
    };
  }

  async getAgentStats(userId: string, agentId: number) {
    const [agent] = await this.db
      .select()
      .from(agentRegistry)
      .where(and(eq(agentRegistry.id, agentId), eq(agentRegistry.userId, userId)))
      .limit(1);

    if (!agent) return null;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const spam = spamFilter();

    const [txStats24h] = await this.db
      .select({
        txCount: count(),
        totalGas: sum(transactions.gasCostUsd),
        totalVolume: sum(transactions.amountUsd),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletAddress, agent.walletAddress),
          gte(transactions.timestamp, dayAgo),
          spam,
        ),
      );

    const [txStats7d] = await this.db
      .select({
        txCount: count(),
        totalGas: sum(transactions.gasCostUsd),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletAddress, agent.walletAddress),
          gte(transactions.timestamp, weekAgo),
          spam,
        ),
      );

    return {
      agent,
      stats: {
        txCount24h: txStats24h?.txCount ?? 0,
        gasSpend24h: parseFloat(txStats24h?.totalGas ?? '0'),
        volume24h: parseFloat(txStats24h?.totalVolume ?? '0'),
        txCount7d: txStats7d?.txCount ?? 0,
        gasSpend7d: parseFloat(txStats7d?.totalGas ?? '0'),
      },
    };
  }
}
