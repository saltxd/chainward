import { pgTable, uuid, text, jsonb, integer, boolean, bigint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const riskReports = pgTable(
  'risk_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // identity / cache key
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull().default('base'),
    asOfBlock: bigint('as_of_block', { mode: 'number' }).notNull(),
    classifierVersion: text('classifier_version').notNull(),

    // denormalized card columns
    band: text('band').notNull(),
    flagCount: integer('flag_count').notNull().default(0),
    topFlags: jsonb('top_flags'),
    agentName: text('agent_name'),
    survivalClass: text('survival_class'),
    viewCount: integer('view_count').notNull().default(0),

    // full payloads
    reportData: jsonb('report_data').notNull(),
    riskAssessment: jsonb('risk_assessment').notNull(),
    sources: jsonb('sources'),
    reportMarkdown: text('report_markdown'),

    // publication / freshness
    isPublic: boolean('is_public').notNull().default(true),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // NOTE: migrations/0016_risk_reports.sql is the AUTHORITATIVE DDL — the SQL
  // migration runner is the canonical deploy path (per CLAUDE.md). These Drizzle
  // index defs mirror it (incl. DESC ordering + the partial is_public predicate)
  // so `drizzle-kit generate/push` stays consistent, but 0016 is the source of truth.
  (table) => [
    uniqueIndex('uq_risk_reports_key').on(
      sql`lower(${table.walletAddress})`,
      table.chain,
      table.asOfBlock,
      table.classifierVersion,
    ),
    index('idx_risk_reports_address_generated').on(
      sql`lower(${table.walletAddress})`,
      table.chain,
      table.generatedAt.desc(),
    ),
    index('idx_risk_reports_public_generated')
      .on(table.generatedAt.desc())
      .where(sql`${table.isPublic} = true`),
    index('idx_risk_reports_view_count').on(table.viewCount.desc()),
  ],
);
