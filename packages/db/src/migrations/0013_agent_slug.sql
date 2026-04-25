-- 0013: add slug column for /base/<slug> routes
--
-- Idempotent end-to-end so it can re-run safely after a partial earlier failure.

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

-- Disambiguate slug collisions among public observatory agents.
-- Two distinct agents on Virtuals can share a display name (e.g. "HAL 9000",
-- "Lyra"). For URL routing we need one canonical slug per (chain, slug) within
-- the public observatory; suffix the others with their wallet-address hash.
-- Lowest-id wins the unsuffixed slug. Idempotent: once disambiguated, future
-- runs find no dupes and update zero rows.
WITH numbered AS (
  SELECT id, chain, slug, wallet_address,
    ROW_NUMBER() OVER (
      PARTITION BY chain, slug
      ORDER BY id
    ) AS rn
  FROM agent_registry
  WHERE is_observatory = true AND is_public = true
)
UPDATE agent_registry ar
SET slug = LEFT(
  ar.slug || '-' || SUBSTRING(REGEXP_REPLACE(ar.wallet_address, '^0x', '', 'i') FROM 1 FOR 8),
  60
)
FROM numbered n
WHERE ar.id = n.id AND n.rn > 1;

ALTER TABLE agent_registry
  ALTER COLUMN slug SET NOT NULL;

-- Partial unique index: only public observatory agents need URL-stable slugs.
-- This lets users register private "AIXBT" entries without conflicting with
-- the canonical observatory entry.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registry_chain_slug
  ON agent_registry (chain, slug)
  WHERE is_observatory = true AND is_public = true;
