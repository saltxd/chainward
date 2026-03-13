-- Users (Better Auth core + ChainWard extensions)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier TEXT NOT NULL DEFAULT 'free',
  agent_limit INTEGER NOT NULL DEFAULT 3,
  event_limit INTEGER NOT NULL DEFAULT 10000,
  events_used INTEGER NOT NULL DEFAULT 0,
  events_reset_at TIMESTAMPTZ
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verifications
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Registry
CREATE TABLE IF NOT EXISTS agent_registry (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  agent_name TEXT,
  agent_framework TEXT,
  registry_source TEXT NOT NULL DEFAULT 'manual',
  registry_id TEXT,
  is_safe BOOLEAN NOT NULL DEFAULT false,
  safe_modules TEXT[],
  confidence REAL NOT NULL DEFAULT 1.0,
  tags TEXT[],
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registry_unique ON agent_registry(chain, wallet_address, user_id);
CREATE INDEX IF NOT EXISTS idx_agent_registry_chain ON agent_registry(chain);
CREATE INDEX IF NOT EXISTS idx_agent_registry_framework ON agent_registry(agent_framework);
CREATE INDEX IF NOT EXISTS idx_agent_registry_user ON agent_registry(user_id);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  timestamp TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  wallet_address TEXT NOT NULL,
  direction TEXT NOT NULL,
  counterparty TEXT,
  token_address TEXT,
  token_symbol TEXT,
  token_decimals SMALLINT,
  amount_raw NUMERIC(78, 0),
  amount_usd NUMERIC(20, 6),
  gas_used BIGINT,
  gas_price_gwei NUMERIC(20, 9),
  gas_cost_native NUMERIC(30, 18),
  gas_cost_usd NUMERIC(20, 6),
  tx_type TEXT,
  method_id TEXT,
  method_name TEXT,
  contract_address TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  raw_data JSONB,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_wallet_time ON transactions(wallet_address, timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_chain_wallet ON transactions(chain, wallet_address, timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(tx_type, timestamp);

-- Balance Snapshots
CREATE TABLE IF NOT EXISTS balance_snapshots (
  timestamp TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  token_address TEXT,
  token_symbol TEXT,
  balance_raw NUMERIC(78, 0),
  balance_usd NUMERIC(20, 6),
  snapshot_type TEXT NOT NULL DEFAULT 'periodic',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_balance_wallet_time ON balance_snapshots(wallet_address, timestamp);
CREATE INDEX IF NOT EXISTS idx_balance_chain_wallet_token ON balance_snapshots(chain, wallet_address, token_address, timestamp);

-- Alert Configs
CREATE TABLE IF NOT EXISTS alert_configs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  threshold_value NUMERIC(30, 6),
  threshold_unit TEXT,
  lookback_window INTERVAL,
  channels TEXT[] NOT NULL DEFAULT '{webhook}',
  webhook_url TEXT,
  telegram_chat_id TEXT,
  discord_webhook TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown INTERVAL NOT NULL DEFAULT '5 minutes',
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_configs_user ON alert_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_configs_wallet ON alert_configs(wallet_address, chain);

-- Alert Events
CREATE TABLE IF NOT EXISTS alert_events (
  timestamp TIMESTAMPTZ NOT NULL,
  alert_config_id BIGINT NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT,
  trigger_value NUMERIC(30, 6),
  trigger_tx_hash TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  delivery_channel TEXT,
  delivery_error TEXT,
  context_data JSONB
);
CREATE INDEX IF NOT EXISTS idx_alert_events_config ON alert_events(alert_config_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_events_wallet ON alert_events(wallet_address, timestamp);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{read}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
