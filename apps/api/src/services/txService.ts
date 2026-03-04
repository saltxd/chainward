import { eq, and, gte, lte, desc, ilike, sql, count, inArray, notInArray, isNull, or } from 'drizzle-orm';
import { transactions, agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import { SPAM_TOKENS } from '@chainward/common';

const spamList = [...SPAM_TOKENS];

interface TxFilter {
  walletAddress?: string;
  chain?: string;
  direction?: string;
  txType?: string;
  status?: string;
  from?: Date;
  to?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export class TxService {
  constructor(private db: Database) {}

  async list(userId: string, filter: TxFilter) {
    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    // Get user's wallets
    const agents = await this.db
      .select({ walletAddress: agentRegistry.walletAddress })
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId));

    const wallets = filter.walletAddress
      ? [filter.walletAddress]
      : agents.map((a) => a.walletAddress);

    if (wallets.length === 0) {
      return { data: [], pagination: { total: 0, limit, offset, hasMore: false } };
    }

    const conditions = [inArray(transactions.walletAddress, wallets)];

    if (spamList.length > 0) {
      conditions.push(or(isNull(transactions.tokenAddress), notInArray(transactions.tokenAddress, spamList))!);
    }

    if (filter.chain) conditions.push(eq(transactions.chain, filter.chain));
    if (filter.direction) conditions.push(eq(transactions.direction, filter.direction));
    if (filter.txType) conditions.push(eq(transactions.txType, filter.txType));
    if (filter.status) conditions.push(eq(transactions.status, filter.status));
    if (filter.from) conditions.push(gte(transactions.timestamp, filter.from));
    if (filter.to) conditions.push(lte(transactions.timestamp, filter.to));
    if (filter.search) {
      const escaped = filter.search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
      conditions.push(ilike(transactions.txHash, `%${escaped}%`));
    }

    const where = and(...conditions);

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(transactions)
      .where(where);

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.timestamp))
      .limit(limit)
      .offset(offset);

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  async getVolumeStats(userId: string, wallet?: string, from?: Date, to?: Date, bucket = '1h') {
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
        COALESCE(SUM(amount_usd), 0) AS total_volume_usd,
        COALESCE(SUM(gas_cost_usd), 0) AS total_gas_usd
      FROM transactions
      WHERE wallet_address = ANY(${`{${wallets.join(',')}}`}::text[])
        AND timestamp >= ${fromStr}::timestamptz
        AND timestamp <= ${toStr}::timestamptz
        ${spamExclusion}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return result;
  }
}
