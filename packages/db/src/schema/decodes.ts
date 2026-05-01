import { pgTable, uuid, text, jsonb, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const decodes = pgTable(
  'decodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id').notNull().unique(),
    buyerWallet: text('buyer_wallet').notNull(),
    targetInput: text('target_input').notNull(),
    targetWallet: text('target_wallet').notNull(),
    tier: text('tier').notNull().default('quick'),
    status: text('status').notNull(),
    result: jsonb('result'),
    rejectReason: text('reject_reason'),
    feeUsdc: numeric('fee_usdc', { precision: 10, scale: 2 }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_decodes_job_id').on(table.jobId),
    index('idx_decodes_buyer').on(table.buyerWallet, table.acceptedAt),
    index('idx_decodes_target').on(table.targetWallet),
    index('idx_decodes_status_accepted').on(table.status, table.acceptedAt),
  ],
);
