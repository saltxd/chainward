import { pgTable, uuid, text, bigint, timestamp, customType } from 'drizzle-orm/pg-core';

// drizzle-orm/pg-core has no bytea column type; node-postgres maps bytea <-> Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** One-off datasets sold for USDC (see migration 0021). */
export const paidFiles = pgTable('paid_files', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull().default('text/csv'),
  priceUsdc: bigint('price_usdc', { mode: 'number' }).notNull(), // micro-USDC
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  content: bytea('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One claim per on-chain USDC transfer (unique on lower(tx_hash)). */
export const paidFileClaims = pgTable('paid_file_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  txHash: text('tx_hash').notNull(),
  payerWallet: text('payer_wallet').notNull(),
  amountUsdc: bigint('amount_usdc', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
