-- 0026: wallet_labels, what ChainWard's investigations and detectors found about a
-- wallet (one of a group that appears to be run together, a seller that funds its own
-- buyers, a serial token launcher, a known service), with its evidence.
--
-- Two levels. Public labels come from published work or a documented detector and are
-- read by the public checks (the API looks them up per request). Private labels come from
-- tips sent privately to a program; only our own scripts (paid screens and audits)
-- read them. The table itself refuses a public label sourced from a tip.

CREATE TABLE IF NOT EXISTS wallet_labels (
  id             bigserial PRIMARY KEY,
  chain          text NOT NULL,
  address        text NOT NULL,
  kind           text NOT NULL,
  strength       text NOT NULL,
  visibility     text NOT NULL,
  group_key      text,
  group_size     integer,
  sentence       text NOT NULL,
  source_type    text NOT NULL,
  source_ref     text NOT NULL,
  source_url     text,
  evidence_url   text,
  note           text,
  as_of          date NOT NULL,
  expires_at     timestamptz,
  removed_at     timestamptz,
  removed_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_labels_kind CHECK (kind IN ('run_together', 'hiring_loop', 'self_funded_seller', 'serial_launcher', 'launch_dumper', 'operator_wallet', 'service')),
  CONSTRAINT wallet_labels_strength CHECK (strength IN ('strong', 'weak')),
  CONSTRAINT wallet_labels_visibility CHECK (visibility IN ('public', 'private')),
  CONSTRAINT wallet_labels_source_type CHECK (source_type IN ('decode', 'dataset', 'detector', 'tip', 'list')),
  CONSTRAINT wallet_labels_public_not_tip CHECK (NOT (visibility = 'public' AND source_type = 'tip')),
  CONSTRAINT wallet_labels_address_lower CHECK (address = lower(address))
);

-- One row per address, kind and source; a re-import updates it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_labels_source ON wallet_labels (chain, address, kind, source_type, source_ref);
-- The API loads the live public labels.
CREATE INDEX IF NOT EXISTS idx_wallet_labels_live_public ON wallet_labels (visibility) WHERE removed_at IS NULL;
-- Scripts look labels up by address.
CREATE INDEX IF NOT EXISTS idx_wallet_labels_address ON wallet_labels (address);
