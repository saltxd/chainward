import { pgTable, uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';

/** One row per settled x402 payment, written by the API's onAfterSettle hook (migration 0023). */
export const x402Settlements = pgTable('x402_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  txHash: text('tx_hash').notNull(),
  network: text('network').notNull(),
  payer: text('payer'),
  payTo: text('pay_to').notNull(),
  asset: text('asset').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(), // atomic units
  route: text('route'),
  path: text('path'),
  settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
});
