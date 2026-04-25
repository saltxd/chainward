-- 0013: add slug column for /base/<slug> routes

ALTER TABLE agent_registry
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Note: Postgres doesn't have NFKD/unaccent built-in, so this backfill does NOT
-- strip diacritics like the JS agentSlug() helper does. Acceptable because
-- existing rows have ASCII names. Future agents are inserted via TypeScript
-- which DOES strip diacritics. If we ever need to backfill agents with
-- accented names, install the `unaccent` extension first.
UPDATE agent_registry
SET slug = LEFT(
  COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(LOWER(agent_name), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      ''
    ),
    'agent-' || SUBSTRING(REGEXP_REPLACE(wallet_address, '^0x', '', 'i') FROM 1 FOR 8)
  ),
  60
)
WHERE slug IS NULL;

-- Make slug NOT NULL + UNIQUE on (chain, slug). Two agents on different chains
-- could theoretically share a name; the chain+slug pair must still be unique.
ALTER TABLE agent_registry
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registry_chain_slug
  ON agent_registry (chain, slug);
