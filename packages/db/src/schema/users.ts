import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletAddress: text('wallet_address').notNull().unique(),
  displayName: text('display_name'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // ChainWard extensions
  tier: text('tier', { enum: ['free', 'starter', 'pro', 'enterprise'] })
    .notNull()
    .default('free'),
  agentLimit: integer('agent_limit').notNull().default(3),
  eventLimit: integer('event_limit').notNull().default(10000),
  eventsUsed: integer('events_used').notNull().default(0),
  eventsResetAt: timestamp('events_reset_at', { withTimezone: true }),
});
