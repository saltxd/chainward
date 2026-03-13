ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS is_observatory BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agent_registry_observatory ON agent_registry (is_observatory) WHERE is_observatory = true;
