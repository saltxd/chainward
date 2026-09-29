import { eq, and, sql } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import { usableSnapshotSets } from './balanceSets.js';

export class BalanceService {
  constructor(private db: Database) {}

  async getLatest(userId: string) {
    const agents = await this.db
      .select({ walletAddress: agentRegistry.walletAddress, chain: agentRegistry.chain })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    if (agents.length === 0) return [];

    const wallets = agents.map((a) => a.walletAddress);

    // Rows of each wallet's latest full snapshot. Latest-row-per-token would keep
    // showing a token sold to zero, since zero balances are never written.
    const walletArray = `{${wallets.join(',')}}`;
    const fromStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toStr = new Date().toISOString();
    const result = await this.db.execute(sql`
      WITH ${usableSnapshotSets(walletArray, fromStr, toStr)},
      latest AS (
        SELECT DISTINCT ON (wallet_address) wallet_address, timestamp
        FROM usable
        ORDER BY wallet_address, timestamp DESC
      )
      SELECT b.wallet_address, b.chain, b.token_address, b.token_symbol, b.balance_raw, b.balance_usd, b.timestamp
      FROM latest l
      JOIN balance_snapshots b
        ON b.wallet_address = l.wallet_address
       AND b.timestamp = l.timestamp
      WHERE b.timestamp >= ${fromStr}::timestamptz
      ORDER BY b.wallet_address, b.token_address
    `);

    return result;
  }

  async getHistory(
    userId: string,
    wallet?: string,
    from?: Date,
    to?: Date,
    bucket = '1h',
  ) {
    // Get wallets to query
    let wallets: string[];
    if (wallet) {
      // Verify user owns this wallet
      const [agent] = await this.db
        .select()
        .from(agentRegistry)
        .where(
          and(eq(agentRegistry.walletAddress, wallet), eq(agentRegistry.userId, userId)),
        )
        .limit(1);

      if (!agent) return [];
      wallets = [wallet];
    } else {
      const agents = await this.db
        .select({ walletAddress: agentRegistry.walletAddress })
        .from(agentRegistry)
        .where(eq(agentRegistry.userId, userId));

      wallets = agents.map((a) => a.walletAddress);
      if (wallets.length === 0) return [];
    }

    const interval = bucket === '1d' ? '1 day' : '1 hour';
    const defaultFrom = new Date(Date.now() - (bucket === '1d' ? 30 : 7) * 24 * 60 * 60 * 1000);

    const fromStr = (from ?? defaultFrom).toISOString();
    const toStr = (to ?? new Date()).toISOString();

    // Each wallet's latest full snapshot in the bucket, summed across wallets per token.
    const walletArray = `{${wallets.join(',')}}`;
    const result = await this.db.execute(sql`
      WITH ${usableSnapshotSets(walletArray, fromStr, toStr)},
      latest AS (
        SELECT DISTINCT ON (wallet_address, bucket) wallet_address, bucket, timestamp
        FROM (
          SELECT wallet_address, time_bucket(${interval}::interval, timestamp) AS bucket, timestamp
          FROM usable
        ) u
        ORDER BY wallet_address, bucket, timestamp DESC
      )
      SELECT
        l.bucket,
        b.token_symbol,
        b.token_address,
        SUM(b.balance_usd) AS balance_usd,
        SUM(b.balance_raw) AS balance_raw
      FROM latest l
      JOIN balance_snapshots b
        ON b.wallet_address = l.wallet_address
       AND b.timestamp = l.timestamp
      WHERE b.timestamp >= ${fromStr}::timestamptz
        AND b.timestamp <= ${toStr}::timestamptz
      GROUP BY l.bucket, b.token_symbol, b.token_address
      ORDER BY l.bucket ASC
    `);

    return result;
  }
}
