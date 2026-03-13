-- Observatory candidate agents discovered via ERC-8004 registry event scanning
CREATE TABLE IF NOT EXISTS observatory_candidates (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL DEFAULT 'base',
  wallet_address TEXT NOT NULL,
  agent_name TEXT,
  registry_token_id INTEGER NOT NULL,
  registry_owner TEXT NOT NULL,
  token_uri TEXT,
  tx_count INTEGER NOT NULL DEFAULT 0,
  balance_eth NUMERIC(28, 18) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'dismissed'
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain, registry_token_id)
);

CREATE INDEX IF NOT EXISTS idx_observatory_candidates_status ON observatory_candidates (status);
CREATE INDEX IF NOT EXISTS idx_observatory_candidates_wallet ON observatory_candidates (wallet_address);
