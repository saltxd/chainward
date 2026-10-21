import { pgTable, bigserial, text, integer, date, timestamp } from 'drizzle-orm/pg-core';

/**
 * What ChainWard's investigations and detectors found about a wallet (migration 0026).
 * Public labels are read by the public checks; private ones (from tips) only by our
 * own scripts. The table refuses a public label sourced from a tip.
 */
export const walletLabels = pgTable('wallet_labels', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chain: text('chain').notNull(),
  address: text('address').notNull(),
  kind: text('kind').notNull(),
  strength: text('strength').notNull(),
  visibility: text('visibility').notNull(),
  groupKey: text('group_key'),
  groupSize: integer('group_size'),
  sentence: text('sentence').notNull(),
  sourceType: text('source_type').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceUrl: text('source_url'),
  evidenceUrl: text('evidence_url'),
  note: text('note'),
  asOf: date('as_of').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  removedReason: text('removed_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
