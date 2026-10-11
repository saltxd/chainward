-- 0024: tier_payments — one row per USDC transfer accepted by POST /api/payments/verify
-- (tier upgrades and one-time payments). Nothing recorded these before, so any past
-- qualifying transfer could repeat an upgrade. The unique index lets each on-chain
-- transfer count once.
-- NOT a hypertable.

CREATE TABLE IF NOT EXISTS tier_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash        text NOT NULL,
  user_id        text NOT NULL,
  plan           text NOT NULL,
  payer_wallet   text NOT NULL,
  amount_usdc    bigint NOT NULL,              -- micro-USDC (6 decimals)
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tier_payments_tx_hash
  ON tier_payments (lower(tx_hash));

CREATE INDEX IF NOT EXISTS idx_tier_payments_user_id
  ON tier_payments (user_id);
