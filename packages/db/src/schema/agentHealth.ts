import { pgTable, bigint, date, smallint, numeric, index } from 'drizzle-orm/pg-core';
import { agentRegistry } from './agents';

export const dailyAgentHealth = pgTable(
  'daily_agent_health',
  {
    agentId: bigint('agent_id', { mode: 'number' })
      .notNull()
      .references(() => agentRegistry.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    score: smallint('score').notNull(),
    uptimePct: numeric('uptime_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    gasEfficiency: numeric('gas_efficiency', { precision: 5, scale: 2 }).notNull().default('0'),
    failureRate: numeric('failure_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    consistency: numeric('consistency', { precision: 5, scale: 2 }).notNull().default('0'),
  },
  (table) => [
    index('idx_health_date').on(table.date),
    index('idx_health_score').on(table.date, table.score),
  ],
);
