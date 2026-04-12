import { pgTable, text, timestamp, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import { agentRegistry } from './agents';

export const agentEvents = pgTable(
  'agent_events',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    agentId: bigint('agent_id', { mode: 'number' }).notNull().references(() => agentRegistry.id),
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull().default('base'),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_events_agent_time').on(table.agentId, table.timestamp),
    index('idx_agent_events_type_time').on(table.eventType, table.timestamp),
    index('idx_agent_events_wallet').on(table.walletAddress, table.timestamp),
  ],
);
