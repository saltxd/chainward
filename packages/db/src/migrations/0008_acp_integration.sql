-- 0008: ACP (Agent Commerce Protocol) integration tables
-- Stores economic data from Virtuals ACP API (acpx.virtuals.io)

-- ACP agent economic data (synced from ACP API every 6 hours)
CREATE TABLE IF NOT EXISTS acp_agent_data (
  id BIGSERIAL PRIMARY KEY,
  acp_id INTEGER NOT NULL,                    -- ACP internal agent ID
  document_id TEXT,                           -- Strapi document ID
  wallet_address TEXT NOT NULL,
  owner_address TEXT,
  name TEXT,
  description TEXT,
  token_address TEXT,
  symbol TEXT,
  virtual_agent_id INTEGER,                   -- links to Virtuals launchpad agent
  twitter_handle TEXT,
  profile_pic TEXT,
  category TEXT,
  role TEXT,                                   -- PROVIDER, REQUESTOR, EVALUATOR, HYBRID
  contract_address TEXT,                       -- ACP contract version used
  has_graduated BOOLEAN,
  is_virtual_agent BOOLEAN,
  is_online BOOLEAN,

  -- Economic metrics
  successful_job_count INTEGER,
  success_rate NUMERIC,
  unique_buyer_count INTEGER,
  transaction_count INTEGER,
  gross_agentic_amount NUMERIC,               -- aGDP
  revenue NUMERIC,
  rating NUMERIC,
  wallet_balance TEXT,                         -- string from API
  processing_time NUMERIC,

  -- Offerings (stored as JSON array)
  offerings JSONB,
  resources JSONB,

  -- Full raw response
  raw_json JSONB NOT NULL,

  -- Timestamps
  last_active_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_acp_agent_wallet UNIQUE (wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_acp_agent_wallet ON acp_agent_data (LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_acp_agent_acp_id ON acp_agent_data (acp_id);
CREATE INDEX IF NOT EXISTS idx_acp_agent_virtual_id ON acp_agent_data (virtual_agent_id) WHERE virtual_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acp_agent_graduated ON acp_agent_data (has_graduated) WHERE has_graduated = true;
CREATE INDEX IF NOT EXISTS idx_acp_agent_jobs ON acp_agent_data (successful_job_count DESC NULLS LAST);

-- ACP agent-to-agent interactions (synced from interactions API)
CREATE TABLE IF NOT EXISTS acp_interactions (
  id BIGSERIAL PRIMARY KEY,
  interaction_id INTEGER NOT NULL,             -- ID from ACP API
  document_id TEXT,
  job_id TEXT,
  tx_hash TEXT,
  type TEXT,                                   -- REQUEST_JOB, DELIVER, EVALUATE, etc.
  memo_type INTEGER,
  content TEXT,                                -- JSON string of job details
  job_summary TEXT,

  -- Participants
  from_agent_id INTEGER,
  from_agent_name TEXT,
  from_agent_owner TEXT,
  to_agent_id INTEGER,
  to_agent_name TEXT,
  to_agent_owner TEXT,
  client_address TEXT,

  -- Economics
  budget NUMERIC,
  budget_token_address TEXT,
  usd_amount NUMERIC,

  -- Raw
  raw_json JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_acp_interaction UNIQUE (interaction_id)
);

CREATE INDEX IF NOT EXISTS idx_acp_interaction_job ON acp_interactions (job_id);
CREATE INDEX IF NOT EXISTS idx_acp_interaction_time ON acp_interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acp_interaction_from ON acp_interactions (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_acp_interaction_to ON acp_interactions (to_agent_id);

-- ACP ecosystem metrics (daily snapshots)
CREATE TABLE IF NOT EXISTS acp_ecosystem_metrics (
  id BIGSERIAL PRIMARY KEY,
  total_agdp NUMERIC,
  total_revenue NUMERIC,
  total_jobs INTEGER,
  total_unique_wallets INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acp_eco_time ON acp_ecosystem_metrics (captured_at DESC);

-- Add acp_agent_id column to agent_registry for cross-referencing
ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS acp_agent_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_agent_registry_acp ON agent_registry (acp_agent_id) WHERE acp_agent_id IS NOT NULL;
