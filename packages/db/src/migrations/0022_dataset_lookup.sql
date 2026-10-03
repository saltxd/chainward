-- 0022: dataset_lookup — per-address rows behind a paid file, so anyone can
-- check one wallet for free (and buy the full file for the rest). Loaded from
-- the same CSV as paid_files.content; only the columns we expose publicly.

CREATE TABLE IF NOT EXISTS dataset_lookup (
  slug      text NOT NULL REFERENCES paid_files(slug),
  chain     text NOT NULL,
  address   text NOT NULL,            -- lowercase
  tier      text NOT NULL,
  fields    jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (slug, chain, address)
);

CREATE INDEX IF NOT EXISTS idx_dataset_lookup_slug_address ON dataset_lookup (slug, address);
