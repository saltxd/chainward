-- 0016: risk_reports table for the public Risk-Check library
--
-- Stores one cached forensic risk report per (address, chain, as_of_block,
-- classifier_version). The FIRST decode of an address is cached and becomes
-- PUBLIC + FREE forever — the compounding, SEO-indexed public library.
--
-- This is NOT the `decodes` table (the ACP job ledger) — leave that one alone.
-- NOT a TimescaleDB hypertable — expected volume is low and read-heavy.
-- gen_random_uuid() is available natively in PostgreSQL 13+ (no pgcrypto needed).

CREATE TABLE IF NOT EXISTS risk_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity / cache key
  wallet_address    text NOT NULL,
  chain             text NOT NULL DEFAULT 'base',
  as_of_block       bigint NOT NULL,
  classifier_version text NOT NULL,

  -- denormalized card columns (cheap library/list reads without parsing jsonb)
  band              text NOT NULL,
  flag_count        integer NOT NULL DEFAULT 0,
  top_flags         jsonb,
  agent_name        text,
  survival_class    text,
  view_count        integer NOT NULL DEFAULT 0,

  -- full payloads
  report_data       jsonb NOT NULL,
  risk_assessment   jsonb NOT NULL,
  sources           jsonb,
  report_markdown   text,

  -- publication / freshness
  is_public         boolean NOT NULL DEFAULT true,
  generated_at      timestamptz NOT NULL DEFAULT now()
);

-- Cache key: one report per address+chain+block+classifier. lower() so the same
-- address never duplicates across mixed-case input.
CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_reports_key
  ON risk_reports (lower(wallet_address), chain, as_of_block, classifier_version);

-- Latest-report lookup for a given address (report page + freshness check).
CREATE INDEX IF NOT EXISTS idx_risk_reports_address_generated
  ON risk_reports (lower(wallet_address), chain, generated_at DESC);

-- Library "recent" feed.
CREATE INDEX IF NOT EXISTS idx_risk_reports_public_generated
  ON risk_reports (generated_at DESC) WHERE is_public = true;

-- Most-viewed ordering.
CREATE INDEX IF NOT EXISTS idx_risk_reports_view_count
  ON risk_reports (view_count DESC);
