import { pgTable, bigserial, text, boolean, real, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const agentRegistry = pgTable(
  'agent_registry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chain: text('chain').notNull(), // 'base' | 'solana'
    walletAddress: text('wallet_address').notNull(),
    agentName: text('agent_name'),
    agentFramework: text('agent_framework'), // 'elizaos' | 'olas' | 'virtuals' | 'agentkit' | 'custom'
    registrySource: text('registry_source').notNull().default('manual'), // 'erc8004' | 'olas' | 'virtuals' | 'manual' | 'heuristic'
    registryId: text('registry_id'),
    isSafe: boolean('is_safe').notNull().default(false),
    safeModules: text('safe_modules').array(),
    confidence: real('confidence').notNull().default(1.0),
    tags: text('tags').array(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_agent_registry_unique').on(table.chain, table.walletAddress, table.userId),
    index('idx_agent_registry_chain').on(table.chain),
    index('idx_agent_registry_framework').on(table.agentFramework),
    index('idx_agent_registry_user').on(table.userId),
  ],
);
