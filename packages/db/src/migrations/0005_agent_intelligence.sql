-- 0005_agent_intelligence.sql
-- Agent Intelligence Pipeline: health scores, protocol stats, A2A detection, classification

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Daily Agent Health Scores
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_agent_health (
  agent_id   BIGINT NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  score      SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
  uptime_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  gas_efficiency NUMERIC(5,2) NOT NULL DEFAULT 0,
  failure_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  consistency    NUMERIC(5,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_health_date ON daily_agent_health (date);
CREATE INDEX IF NOT EXISTS idx_health_score ON daily_agent_health (date, score DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Weekly Protocol Stats
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS weekly_protocol_stats (
  week_start    DATE NOT NULL,
  protocol      TEXT NOT NULL,
  tx_count      INTEGER NOT NULL DEFAULT 0,
  unique_agents INTEGER NOT NULL DEFAULT 0,
  gas_total     NUMERIC(20,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, protocol)
);

CREATE INDEX IF NOT EXISTS idx_protocol_stats_week ON weekly_protocol_stats (week_start);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Agent-to-Agent Interaction Detection
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_agent_interaction BOOLEAN DEFAULT false;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS counterparty_agent_id BIGINT;

-- Partial index — only rows that ARE agent interactions
CREATE INDEX IF NOT EXISTS idx_tx_agent_interaction
  ON transactions (counterparty_agent_id, timestamp)
  WHERE is_agent_interaction = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Agent Classification Source
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE agent_registry
  ADD COLUMN IF NOT EXISTS classification_source TEXT DEFAULT 'auto';
