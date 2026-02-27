import { pgTable, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Balance snapshots — will be converted to a TimescaleDB hypertable via raw SQL migration.
 */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    chain: text('chain').notNull(),
    walletAddress: text('wallet_address').notNull(),
    tokenAddress: text('token_address'), // null for native
    tokenSymbol: text('token_symbol'),
    balanceRaw: numeric('balance_raw', { precision: 78, scale: 0 }),
    balanceUsd: numeric('balance_usd', { precision: 20, scale: 6 }),
    snapshotType: text('snapshot_type').notNull().default('periodic'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_balance_wallet_time').on(table.walletAddress, table.timestamp),
    index('idx_balance_chain_wallet_token').on(
      table.chain,
      table.walletAddress,
      table.tokenAddress,
      table.timestamp,
    ),
  ],
);
