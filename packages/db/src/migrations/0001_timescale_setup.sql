-- TimescaleDB Extension & Hypertable Setup
-- This runs AFTER Drizzle migrations create the base tables.

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert transactions to hypertable (1-day chunks)
SELECT create_hypertable('transactions', 'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Convert balance_snapshots to hypertable (1-day chunks)
SELECT create_hypertable('balance_snapshots', 'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Convert alert_events to hypertable (7-day chunks)
SELECT create_hypertable('alert_events', 'timestamp',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Compression policies
ALTER TABLE transactions SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'wallet_address, chain',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('transactions', INTERVAL '7 days', if_not_exists => TRUE);

ALTER TABLE balance_snapshots SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'wallet_address, chain, token_address',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('balance_snapshots', INTERVAL '3 days', if_not_exists => TRUE);

-- Continuous Aggregates

-- Hourly gas analytics per wallet
CREATE MATERIALIZED VIEW IF NOT EXISTS gas_analytics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  wallet_address,
  chain,
  COUNT(*) AS tx_count,
  SUM(CAST(gas_cost_usd AS DOUBLE PRECISION)) AS total_gas_usd,
  AVG(CAST(gas_cost_usd AS DOUBLE PRECISION)) AS avg_gas_usd,
  MAX(CAST(gas_cost_usd AS DOUBLE PRECISION)) AS max_gas_usd,
  SUM(gas_used) AS total_gas_used,
  AVG(CAST(gas_price_gwei AS DOUBLE PRECISION)) AS avg_gas_price_gwei
FROM transactions
WHERE gas_cost_usd IS NOT NULL
GROUP BY bucket, wallet_address, chain
WITH NO DATA;

SELECT add_continuous_aggregate_policy('gas_analytics_hourly',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Daily gas analytics (built on hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS gas_analytics_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  wallet_address,
  chain,
  SUM(tx_count) AS tx_count,
  SUM(total_gas_usd) AS total_gas_usd,
  SUM(total_gas_usd) / NULLIF(SUM(tx_count), 0) AS avg_gas_usd,
  MAX(max_gas_usd) AS max_gas_usd,
  SUM(total_gas_used) AS total_gas_used
FROM gas_analytics_hourly
GROUP BY bucket, wallet_address, chain
WITH NO DATA;

SELECT add_continuous_aggregate_policy('gas_analytics_daily',
  start_offset => INTERVAL '90 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Hourly transaction volume per wallet
CREATE MATERIALIZED VIEW IF NOT EXISTS tx_volume_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  wallet_address,
  chain,
  direction,
  COUNT(*) AS tx_count,
  SUM(CAST(amount_usd AS DOUBLE PRECISION)) AS total_volume_usd,
  COUNT(DISTINCT counterparty) AS unique_counterparties,
  COUNT(DISTINCT contract_address) AS unique_contracts
FROM transactions
GROUP BY bucket, wallet_address, chain, direction
WITH NO DATA;

SELECT add_continuous_aggregate_policy('tx_volume_hourly',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Retention policies
SELECT add_retention_policy('transactions', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('balance_snapshots', INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('alert_events', INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('gas_analytics_hourly', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('tx_volume_hourly', INTERVAL '90 days', if_not_exists => TRUE);
