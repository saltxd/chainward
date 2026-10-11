import { pgTable, uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';

/** One row per USDC transfer accepted by POST /api/payments/verify (unique on lower(tx_hash), migration 0024). */
export const tierPayments = pgTable('tier_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  txHash: text('tx_hash').notNull(),
  userId: text('user_id').notNull(),
  plan: text('plan').notNull(),
  payerWallet: text('payer_wallet').notNull(),
  amountUsdc: bigint('amount_usdc', { mode: 'number' }).notNull(), // micro-USDC
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
