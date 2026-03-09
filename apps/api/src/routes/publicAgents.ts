import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, gte, count, sum, sql, or, isNull, notInArray } from 'drizzle-orm';
import { agentRegistry, transactions } from '@chainward/db';
import { SPAM_TOKENS } from '@chainward/common';
import { getDb } from '../lib/db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

const spamList = [...SPAM_TOKENS];

const walletParamSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const publicAgents = new Hono();

// Tighter rate limit for public routes: 60 req/min per IP
publicAgents.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:pub-agent' }));

publicAgents.get('/:wallet', async (c) => {
  const walletRaw = c.req.param('wallet');
  const parsed = walletParamSchema.safeParse(walletRaw);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_WALLET', 'Invalid wallet address format');
  }

  const wallet = parsed.data.toLowerCase();
  const db = getDb();

  // 1. Fetch agent — must exist AND be public
  // Use lower() because DB may store EIP-55 checksummed (mixed-case) addresses
  const [agent] = await db
    .select({
      walletAddress: agentRegistry.walletAddress,
      agentName: agentRegistry.agentName,
      agentFramework: agentRegistry.agentFramework,
      chain: agentRegistry.chain,
      createdAt: agentRegistry.createdAt,
    })
    .from(agentRegistry)
    .where(and(sql`lower(${agentRegistry.walletAddress}) = ${wallet}`, eq(agentRegistry.isPublic, true)))
    .limit(1);

  if (!agent) {
    throw new AppError(404, 'NOT_FOUND', 'Agent not found or is not public');
  }

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const spamFilter =
    spamList.length > 0
      ? or(isNull(transactions.tokenAddress), notInArray(transactions.tokenAddress, spamList))
      : undefined;

  // 2. Stats — 24h tx count, gas spend, volume
  const [txStats24h] = await db
    .select({
      txCount: count(),
      totalGas: sum(transactions.gasCostUsd),
      totalVolume: sum(transactions.amountUsd),
    })
    .from(transactions)
    .where(
      and(
        sql`lower(${transactions.walletAddress}) = ${wallet}`,
        gte(transactions.timestamp, dayAgo),
        spamFilter,
      ),
    );

  // 3. Stats — 7d tx count, gas spend
  const [txStats7d] = await db
    .select({
      txCount: count(),
      totalGas: sum(transactions.gasCostUsd),
    })
    .from(transactions)
    .where(
      and(
        sql`lower(${transactions.walletAddress}) = ${wallet}`,
        gte(transactions.timestamp, weekAgo),
        spamFilter,
      ),
    );

  // 4. Balance history (7d, 1h buckets) via TimescaleDB
  const balanceHistory = await db.execute(sql`
    SELECT time_bucket('1 hour', timestamp) AS bucket,
      token_symbol, token_address,
      last(balance_usd, timestamp) AS balance_usd,
      last(balance_raw, timestamp) AS balance_raw
    FROM balance_snapshots
    WHERE lower(wallet_address) = ${wallet} AND timestamp >= ${weekAgo}
    GROUP BY bucket, token_symbol, token_address
    ORDER BY bucket ASC
  `);

  // 5. Gas history (30d, 1d buckets) via TimescaleDB
  const gasHistory = await db.execute(sql`
    SELECT time_bucket('1 day', timestamp) AS bucket,
      count(*) AS tx_count,
      coalesce(sum(gas_cost_usd), 0) AS total_gas_usd,
      coalesce(avg(gas_cost_usd), 0) AS avg_gas_usd
    FROM transactions
    WHERE lower(wallet_address) = ${wallet} AND timestamp >= ${thirtyDaysAgo}
    GROUP BY bucket ORDER BY bucket ASC
  `);

  // 6. Recent 20 transactions
  const recentTxs = await db.execute(sql`
    SELECT timestamp, chain, tx_hash, block_number, wallet_address, direction,
      counterparty, token_symbol, amount_usd, gas_cost_usd, tx_type,
      method_name, status
    FROM transactions WHERE lower(wallet_address) = ${wallet}
    ORDER BY timestamp DESC LIMIT 20
  `);

  return c.json({
    success: true,
    data: {
      agent,
      stats: {
        txCount24h: txStats24h?.txCount ?? 0,
        gasSpend24h: parseFloat(txStats24h?.totalGas ?? '0'),
        volume24h: parseFloat(txStats24h?.totalVolume ?? '0'),
        txCount7d: txStats7d?.txCount ?? 0,
        gasSpend7d: parseFloat(txStats7d?.totalGas ?? '0'),
      },
      balanceHistory,
      gasHistory,
      recentTxs,
    },
  });
});

export { publicAgents };
