import { pgTable, uuid, text, bigint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const briefOrders = pgTable(
  'brief_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // buyer (from the authenticated SIWE session)
    userId: text('user_id').notNull(),
    walletAddress: text('wallet_address').notNull(),

    // the order
    target: text('target').notNull(), // Base address or @handle to decode
    targetKind: text('target_kind', { enum: ['address', 'handle'] })
      .notNull()
      .default('address'),
    contact: text('contact').notNull(),
    contactMethod: text('contact_method', {
      enum: ['email', 'telegram', 'x', 'discord', 'other'],
    })
      .notNull()
      .default('email'),
    notes: text('notes'),

    // commerce
    plan: text('plan').notNull().default('brief'),
    amountUsdc: bigint('amount_usdc', { mode: 'number' }).notNull(), // micro-USDC (6 decimals)
    status: text('status', {
      enum: ['pending', 'paid', 'fulfilling', 'fulfilled', 'failed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    txHash: text('tx_hash'),

    // lifecycle
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  // migrations/0017_brief_orders.sql is the AUTHORITATIVE DDL (the SQL migration
  // runner is the canonical deploy path). These Drizzle index defs mirror it so
  // drizzle-kit stays consistent, but 0017 is the source of truth.
  (table) => [
    uniqueIndex('uq_brief_orders_tx_hash')
      .on(sql`lower(${table.txHash})`)
      .where(sql`${table.txHash} IS NOT NULL`),
    index('idx_brief_orders_status_created').on(table.status, table.createdAt.desc()),
    index('idx_brief_orders_user_created').on(table.userId, table.createdAt.desc()),
  ],
);
