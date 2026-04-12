-- Agent events: structured telemetry from autonomous agents
-- Stores lifecycle events (sequence detection, trade decisions, heartbeats, errors)

-- Create the base table
CREATE TABLE IF NOT EXISTS agent_events (
    timestamp TIMESTAMPTZ NOT NULL,
    agent_id BIGINT NOT NULL REFERENCES agent_registry(id),
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'base',
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to hypertable (1-day chunks)
SELECT create_hypertable('agent_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_events_agent_time
    ON agent_events (agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_type_time
    ON agent_events (event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_wallet
    ON agent_events (wallet_address, timestamp DESC);

-- Compression policy (compress chunks older than 7 days)
ALTER TABLE agent_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'agent_id, event_type',
    timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('agent_events', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 365 days)
SELECT add_retention_policy('agent_events', INTERVAL '365 days', if_not_exists => TRUE);
