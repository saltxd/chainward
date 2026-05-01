-- 0014: decodes table for ACP decoder agent
--
-- Stores every job processed by the ACP decoder agent.
-- NOT a TimescaleDB hypertable — expected volume is low (10-50/month).
-- gen_random_uuid() is available natively in PostgreSQL 13+ (no pgcrypto needed).

CREATE TABLE IF NOT EXISTS decodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        text UNIQUE NOT NULL,
  buyer_wallet  text NOT NULL,
  target_input  text NOT NULL,
  target_wallet text NOT NULL,
  tier          text NOT NULL DEFAULT 'quick',
  status        text NOT NULL,
  result        jsonb,
  reject_reason text,
  fee_usdc      numeric(10,2),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  settled_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_decodes_buyer ON decodes(buyer_wallet, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_decodes_target ON decodes(target_wallet);
CREATE INDEX IF NOT EXISTS idx_decodes_status_accepted ON decodes(status, accepted_at DESC);
