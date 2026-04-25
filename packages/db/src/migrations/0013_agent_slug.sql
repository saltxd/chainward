-- 0013: add slug column for /base/<slug> routes

ALTER TABLE agent_registry
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing rows. Mirrors the algorithm in packages/common/src/slug.ts —
-- keep these in sync if the rules ever change.
UPDATE agent_registry
SET slug = COALESCE(
  NULLIF(
    regexp_replace(
      regexp_replace(LOWER(agent_name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
    ''
  ),
  'agent-' || SUBSTRING(REGEXP_REPLACE(wallet_address, '^0x', '', 'i') FROM 1 FOR 8)
)
WHERE slug IS NULL;

-- Make slug NOT NULL + UNIQUE on (chain, slug). Two agents on different chains
-- could theoretically share a name; the chain+slug pair must still be unique.
ALTER TABLE agent_registry
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registry_chain_slug
  ON agent_registry (chain, slug);
