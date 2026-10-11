-- 0025: fix mangled observatory slugs, and keep the old ones as redirects.
--
-- A one-off batch on 2026-06-06 (108 Virtuals agents) slugged names BEFORE
-- lowercasing, so every capital letter became a dash: "Captain Dackie" got
-- `aptain-ackie`, "Remi" got `emi`, an all-caps name got nothing. acpSync's
-- upsert never rewrites slugs, so ~86 /base/<slug> pages have stayed wrong.
--
-- This re-slugs exactly those rows with the same rules as agentSlug() in
-- packages/common/src/slug.ts, and records each old slug in
-- agent_slug_redirects so /base/<old-slug> 301s to the new page.
--
-- Scope guards:
--   * only public observatory rows (the only ones with /base pages);
--   * only ASCII names, where this SQL and agentSlug() agree exactly (agentSlug
--     also strips accents, which needs the unaccent extension here);
--   * only rows whose slug IS the mangled form of their name (or, for a name
--     with no lowercase letters or digits at all, the agent-<hex> fallback).
-- A new slug already used by another public observatory agent gets the usual
-- `-<first 8 hex of wallet>` suffix (as in 0013); if even that is taken the row
-- is left alone.
--
-- Idempotent: a fixed row's slug no longer equals its mangled form, so a rerun
-- selects nothing. One transaction, so a failure leaves nothing half-done.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_slug_redirects (
  chain       text        NOT NULL,
  old_slug    text        NOT NULL,
  agent_id    bigint      NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, old_slug)
);

CREATE INDEX IF NOT EXISTS idx_agent_slug_redirects_agent
  ON agent_slug_redirects (agent_id);

CREATE TEMP TABLE _agent_reslug ON COMMIT DROP AS
WITH named AS (
  SELECT
    id,
    chain,
    slug,
    wallet_address,
    -- what the 2026-06-06 batch did: replace non [a-z0-9] runs on the ORIGINAL
    -- case (so capitals become dashes), then lowercase, then trim dashes
    LEFT(
      regexp_replace(LOWER(regexp_replace(agent_name, '[^a-z0-9]+', '-', 'g')), '(^-+|-+$)', '', 'g'),
      60
    ) AS mangled,
    -- agentSlug(): lowercase, replace non [a-z0-9] runs, cap at 60, trim dashes
    regexp_replace(
      LEFT(regexp_replace(LOWER(agent_name), '[^a-z0-9]+', '-', 'g'), 60),
      '(^-+|-+$)', '', 'g'
    ) AS target,
    'agent-' || LOWER(SUBSTRING(REGEXP_REPLACE(wallet_address, '^0x', '', 'i') FROM 1 FOR 8)) AS placeholder
  FROM agent_registry
  WHERE is_observatory = true
    AND is_public = true
    AND agent_name ~ '^[ -~]+$'
),
candidates AS (
  SELECT *
  FROM named
  WHERE target <> ''
    AND slug <> target
    AND (
      slug = mangled
      -- the batch numbered its own collisions: a second "Luna" got `una-2`.
      -- mangled holds only [a-z0-9-], so it is safe inside the pattern.
      OR (mangled <> target AND mangled <> '' AND slug ~ ('^' || mangled || '-[0-9]+$'))
      OR (mangled = '' AND slug IN ('', placeholder))
    )
),
ranked AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (PARTITION BY c.chain, c.target ORDER BY c.id) AS rn,
    EXISTS (
      SELECT 1 FROM agent_registry o
      WHERE o.chain = c.chain
        AND o.slug = c.target
        AND o.is_observatory = true
        AND o.is_public = true
        AND o.id <> c.id
    ) AS taken
  FROM candidates c
)
SELECT
  id,
  chain,
  slug AS old_slug,
  CASE
    WHEN taken OR rn > 1
      THEN LEFT(target || '-' || SUBSTRING(placeholder FROM 7), 60)
    ELSE target
  END AS new_slug
FROM ranked;

-- Drop any row whose new slug would still collide: with another public
-- observatory agent's current slug, or with another row in this batch.
DELETE FROM _agent_reslug r
WHERE EXISTS (
    SELECT 1 FROM agent_registry o
    WHERE o.chain = r.chain
      AND o.slug = r.new_slug
      AND o.is_observatory = true
      AND o.is_public = true
      AND o.id <> r.id
  )
  OR r.new_slug IN (
    SELECT new_slug FROM _agent_reslug GROUP BY chain, new_slug HAVING COUNT(*) > 1
  );

INSERT INTO agent_slug_redirects (chain, old_slug, agent_id)
SELECT chain, old_slug, id
FROM _agent_reslug
WHERE old_slug <> ''
ON CONFLICT (chain, old_slug) DO UPDATE
  SET agent_id = EXCLUDED.agent_id,
      created_at = now();

UPDATE agent_registry ar
SET slug = r.new_slug,
    updated_at = NOW()
FROM _agent_reslug r
WHERE ar.id = r.id
  AND ar.slug = r.old_slug;

COMMIT;
