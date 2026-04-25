import { pgTable, bigserial, text, boolean, integer, real, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const agentRegistry = pgTable(
  'agent_registry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chain: text('chain').notNull(), // 'base' | 'solana'
    walletAddress: text('wallet_address').notNull(),
    slug: text('slug').notNull(),
    agentName: text('agent_name'),
    agentFramework: text('agent_framework'), // 'elizaos' | 'olas' | 'virtuals' | 'agentkit' | 'custom'
    registrySource: text('registry_source').notNull().default('manual'), // 'erc8004' | 'olas' | 'virtuals' | 'manual' | 'heuristic'
    registryId: text('registry_id'),
    isSafe: boolean('is_safe').notNull().default(false),
    safeModules: text('safe_modules').array(),
    confidence: real('confidence').notNull().default(1.0),
    tags: text('tags').array(),
    projectUrl: text('project_url'),
    twitterHandle: text('twitter_handle'),
    agentType: text('agent_type'),
    classificationSource: text('classification_source').default('auto'),
    isPublic: boolean('is_public').notNull().default(false),
    isObservatory: boolean('is_observatory').notNull().default(false),
    acpAgentId: integer('acp_agent_id'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_agent_registry_unique').on(table.chain, table.walletAddress, table.userId),
    // The actual DB index is PARTIAL (WHERE is_observatory=true AND is_public=true) — Drizzle
    // doesn't have a clean way to express that, so we declare it as a regular index here.
    // The uniqueness constraint lives in migration 0013_agent_slug.sql.
    index('idx_agent_registry_chain_slug').on(table.chain, table.slug),
    index('idx_agent_registry_chain').on(table.chain),
    index('idx_agent_registry_framework').on(table.agentFramework),
    index('idx_agent_registry_user').on(table.userId),
  ],
);
