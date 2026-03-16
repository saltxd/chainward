import { pgTable, bigserial, text, numeric, integer, timestamp, jsonb, date, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const weeklyDigests = pgTable(
  'weekly_digests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    weekStart: date('week_start').notNull(),
    weekEnd: date('week_end').notNull(),
    digestData: jsonb('digest_data').notNull(),
    headline: jsonb('headline'),
    leaderboards: jsonb('leaderboards'),
    spotlight: jsonb('spotlight'),
    protocolActivity: jsonb('protocol_activity'),
    alertsAnomalies: jsonb('alerts_anomalies'),
    quickStats: jsonb('quick_stats'),
    socialSnippets: jsonb('social_snippets'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_weekly_digest_week').on(table.weekStart),
    index('idx_weekly_digest_week').on(table.weekStart),
  ],
);

export const acpAgentSnapshots = pgTable(
  'acp_agent_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    walletAddress: text('wallet_address').notNull(),
    name: text('name'),
    weekStart: date('week_start').notNull(),
    revenue: numeric('revenue'),
    grossAgenticAmount: numeric('gross_agentic_amount'),
    successfulJobCount: integer('successful_job_count'),
    successRate: numeric('success_rate'),
    uniqueBuyerCount: integer('unique_buyer_count'),
    snapshotData: jsonb('snapshot_data'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_acp_snapshot').on(table.walletAddress, table.weekStart),
    index('idx_acp_snapshot_week').on(table.weekStart),
    index('idx_acp_snapshot_wallet').on(table.walletAddress),
  ],
);
