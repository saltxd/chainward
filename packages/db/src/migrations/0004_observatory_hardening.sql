-- Observatory data pipeline hardening
-- Creates known_contracts reference table, adds metadata columns, creates continuous aggregates

-- ── 1. Known contracts reference table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS known_contracts (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL DEFAULT 'base',
  contract_address TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  contract_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_known_contracts_chain_addr
  ON known_contracts (chain, LOWER(contract_address));

CREATE INDEX IF NOT EXISTS idx_known_contracts_protocol
  ON known_contracts (protocol_name);

-- ── 2. Add protocol_name to transactions ──────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS protocol_name TEXT;

-- ── 3. Add agent metadata columns ─────────────────────────────────────────────
ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS project_url TEXT;
ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS agent_type TEXT;

-- ── 4. Daily agent stats continuous aggregate ─────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_agent_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', timestamp) AS bucket,
  wallet_address,
  chain,
  COUNT(*) AS tx_count,
  COALESCE(SUM(gas_cost_usd::double precision), 0) AS gas_spent_usd,
  COALESCE(SUM(amount_usd::double precision), 0) AS volume_usd,
  COUNT(DISTINCT counterparty) AS unique_counterparties,
  COUNT(DISTINCT protocol_name) AS unique_protocols,
  MIN(timestamp) AS first_tx,
  MAX(timestamp) AS last_tx
FROM transactions
GROUP BY bucket, wallet_address, chain
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_agent_stats',
  start_offset => INTERVAL '90 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ── 5. Weekly ecosystem stats (cagg-on-cagg) ─────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_ecosystem_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('7 days', bucket) AS bucket,
  chain,
  COUNT(DISTINCT wallet_address) AS total_agents_active,
  SUM(tx_count)::bigint AS total_txs,
  SUM(gas_spent_usd) AS total_gas_usd,
  SUM(volume_usd) AS total_volume_usd
FROM daily_agent_stats
GROUP BY time_bucket('7 days', bucket), chain
WITH NO DATA;

SELECT add_continuous_aggregate_policy('weekly_ecosystem_stats',
  start_offset => INTERVAL '90 days',
  end_offset => INTERVAL '7 days',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ── 6. Retention policies ─────────────────────────────────────────────────────
SELECT add_retention_policy('daily_agent_stats', INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('weekly_ecosystem_stats', INTERVAL '730 days', if_not_exists => TRUE);

-- ── 7. Backfill protocol_name on existing transactions ────────────────────────
-- Note: Run this AFTER seeding known_contracts. Only updates uncompressed chunks.
-- UPDATE transactions t
-- SET protocol_name = kc.protocol_name
-- FROM known_contracts kc
-- WHERE LOWER(t.contract_address) = LOWER(kc.contract_address)
--   AND t.chain = kc.chain
--   AND t.protocol_name IS NULL;
