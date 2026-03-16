-- 0009: Weekly digest tables for ChainWard weekly intelligence report

-- Weekly digest storage (one row per week)
CREATE TABLE IF NOT EXISTS weekly_digests (
  id BIGSERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  digest_data JSONB NOT NULL,          -- full digest payload
  headline JSONB,                       -- section 1: top-line numbers
  leaderboards JSONB,                   -- section 2: top performers
  spotlight JSONB,                      -- section 3: agent spotlight
  protocol_activity JSONB,              -- section 4: protocol breakdown
  alerts_anomalies JSONB,              -- section 5: notable alerts and anomalies
  quick_stats JSONB,                    -- section 6: quick stats summary
  social_snippets JSONB,               -- generated tweet-ready snippets
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_weekly_digest_week UNIQUE (week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_digest_week ON weekly_digests (week_start DESC);

-- Weekly snapshots of ACP agent metrics for WoW comparisons
CREATE TABLE IF NOT EXISTS acp_agent_snapshots (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT,
  week_start DATE NOT NULL,
  revenue NUMERIC,
  gross_agentic_amount NUMERIC,
  successful_job_count INTEGER,
  success_rate NUMERIC,
  unique_buyer_count INTEGER,
  snapshot_data JSONB,                  -- full agent data at snapshot time
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_acp_snapshot UNIQUE (wallet_address, week_start)
);

CREATE INDEX IF NOT EXISTS idx_acp_snapshot_week ON acp_agent_snapshots (week_start DESC);
CREATE INDEX IF NOT EXISTS idx_acp_snapshot_wallet ON acp_agent_snapshots (wallet_address);

-- Add last_spotlighted_at to acp_agent_data for spotlight rotation
ALTER TABLE acp_agent_data ADD COLUMN IF NOT EXISTS last_spotlighted_at TIMESTAMPTZ;
