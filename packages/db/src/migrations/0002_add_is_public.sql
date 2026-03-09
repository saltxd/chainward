ALTER TABLE agent_registry ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_agent_registry_public ON agent_registry (is_public) WHERE is_public = true;
