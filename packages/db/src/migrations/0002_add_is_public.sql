ALTER TABLE agent_registry ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agent_registry_public ON agent_registry (is_public) WHERE is_public = true;
