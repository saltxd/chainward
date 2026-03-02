import { eq, and, sql } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import { SPAM_TOKENS } from '@chainward/common';

const spamList = [...SPAM_TOKENS];

export class GasService {
  constructor(private db: Database) {}

  async getAnalytics(
    userId: string,
    wallet?: string,
    from?: Date,
    to?: Date,
    bucket = '1h',
  ) {
    const agents = await this.db
      .select({ walletAddress: agentRegistry.walletAddress })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    const wallets = wallet ? [wallet] : agents.map((a) => a.walletAddress);
    if (wallets.length === 0) return [];

    const interval = bucket === '1d' ? '1 day' : '1 hour';
    const defaultFrom = new Date(Date.now() - (bucket === '1d' ? 30 : 7) * 24 * 60 * 60 * 1000);
    const fromStr = (from ?? defaultFrom).toISOString();
    const toStr = (to ?? new Date()).toISOString();

    const spamExclusion =
      spamList.length > 0
        ? sql`AND (token_address IS NULL OR token_address NOT IN (${sql.join(spamList.map((s) => sql`${s}`), sql`, `)}))`
        : sql``;

    const result = await this.db.execute(sql`
      SELECT
        time_bucket(${interval}::interval, timestamp) AS bucket,
        COUNT(*) AS tx_count,
        COALESCE(SUM(gas_cost_usd), 0) AS total_gas_usd,
        COALESCE(AVG(gas_cost_usd), 0) AS avg_gas_usd,
        COALESCE(MAX(gas_cost_usd), 0) AS max_gas_usd,
        COALESCE(AVG(gas_price_gwei::numeric), 0) AS avg_gas_price_gwei
      FROM transactions
      WHERE wallet_address = ANY(${`{${wallets.join(',')}}`}::text[])
        AND gas_cost_usd IS NOT NULL
        AND timestamp >= ${fromStr}::timestamptz
        AND timestamp <= ${toStr}::timestamptz
        ${spamExclusion}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return result;
  }
}
