import { pgTable, date, text, integer, numeric, index } from 'drizzle-orm/pg-core';

export const weeklyProtocolStats = pgTable(
  'weekly_protocol_stats',
  {
    weekStart: date('week_start').notNull(),
    protocol: text('protocol').notNull(),
    txCount: integer('tx_count').notNull().default(0),
    uniqueAgents: integer('unique_agents').notNull().default(0),
    gasTotal: numeric('gas_total', { precision: 20, scale: 6 }).notNull().default('0'),
  },
  (table) => [
    index('idx_protocol_stats_week').on(table.weekStart),
  ],
);
