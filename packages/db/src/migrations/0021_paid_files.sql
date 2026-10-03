-- 0021: paid_files — one-off datasets sold for USDC (e.g. the full wallet list
-- behind a decode). Content lives in the row; files are a few MB at most.
-- Two ways to buy: an x402 client pays GET /api/paid/:slug/file per request, or a
-- person sends USDC to the treasury and claims a download token with the tx hash.
-- NOT a hypertable.

CREATE TABLE IF NOT EXISTS paid_files (
  slug          text PRIMARY KEY,
  title         text NOT NULL,
  description   text NOT NULL,
  filename      text NOT NULL,
  content_type  text NOT NULL DEFAULT 'text/csv',
  price_usdc    bigint NOT NULL,              -- micro-USDC (6 decimals)
  size_bytes    bigint NOT NULL,
  content       bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One claim per on-chain tx: the same transfer can't unlock a file twice.
CREATE TABLE IF NOT EXISTS paid_file_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL REFERENCES paid_files(slug),
  tx_hash        text NOT NULL,
  payer_wallet   text NOT NULL,
  amount_usdc    bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paid_file_claims_tx_hash
  ON paid_file_claims (lower(tx_hash));
