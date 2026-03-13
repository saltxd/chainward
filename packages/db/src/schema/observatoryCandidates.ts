import { pgTable, bigserial, text, integer, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const observatoryCandidates = pgTable(
  'observatory_candidates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chain: text('chain').notNull().default('base'),
    walletAddress: text('wallet_address').notNull(),
    agentName: text('agent_name'),
    registryTokenId: integer('registry_token_id').notNull(),
    registryOwner: text('registry_owner').notNull(),
    tokenUri: text('token_uri'),
    txCount: integer('tx_count').notNull().default(0),
    balanceEth: numeric('balance_eth', { precision: 28, scale: 18 }).notNull().default('0'),
    status: text('status').notNull().default('pending'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    notes: text('notes'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_observatory_candidates_unique').on(table.chain, table.registryTokenId),
    index('idx_observatory_candidates_status').on(table.status),
    index('idx_observatory_candidates_wallet').on(table.walletAddress),
  ],
);
