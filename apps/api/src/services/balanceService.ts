import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { balanceSnapshots, agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';

export class BalanceService {
  constructor(private db: Database) {}

  async getLatest(userId: string) {
    const agents = await this.db
      .select({ walletAddress: agentRegistry.walletAddress, chain: agentRegistry.chain })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    if (agents.length === 0) return [];

    const wallets = agents.map((a) => a.walletAddress);

    const result = await this.db.execute(sql`
      SELECT DISTINCT ON (wallet_address, token_address)
        wallet_address, chain, token_address, token_symbol, balance_raw, balance_usd, timestamp
      FROM balance_snapshots
      WHERE wallet_address = ANY(${`{${wallets.join(',')}}`}::text[])
      ORDER BY wallet_address, token_address, timestamp DESC
    `);

    return result;
  }

  async getHistory(
    userId: string,
    wallet: string,
    from?: Date,
    to?: Date,
    bucket = '1h',
  ) {
    // Verify user owns this wallet
    const [agent] = await this.db
      .select()
      .from(agentRegistry)
      .where(
        and(eq(agentRegistry.walletAddress, wallet), eq(agentRegistry.userId, userId)),
      )
      .limit(1);

    if (!agent) return [];

    const interval = bucket === '1d' ? '1 day' : '1 hour';
    const defaultFrom = new Date(Date.now() - (bucket === '1d' ? 30 : 7) * 24 * 60 * 60 * 1000);

    const fromStr = (from ?? defaultFrom).toISOString();
    const toStr = (to ?? new Date()).toISOString();

    const result = await this.db.execute(sql`
      SELECT
        time_bucket(${interval}::interval, timestamp) AS bucket,
        token_symbol,
        token_address,
        LAST(balance_usd, timestamp) AS balance_usd,
        LAST(balance_raw, timestamp) AS balance_raw
      FROM balance_snapshots
      WHERE wallet_address = ${wallet}
        AND timestamp >= ${fromStr}::timestamptz
        AND timestamp <= ${toStr}::timestamptz
      GROUP BY bucket, token_symbol, token_address
      ORDER BY bucket ASC
    `);

    return result;
  }
}
