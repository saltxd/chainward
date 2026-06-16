-- 0017: brief_orders — paid "Intel Brief" requests (forensic on-chain decode)
--
-- One row per paid-decode request. Captures WHAT to decode (a Base address or
-- an agent handle) and HOW to deliver it, so a paid order is always fulfillable.
-- Payment is on-chain USDC on Base; tx_hash is set + status flips to 'paid' once
-- the transfer to the treasury is verified (see apps/api/src/routes/brief.ts).
--
-- NOT a TimescaleDB hypertable — low volume, read-heavy ops queue.
-- gen_random_uuid() is native in PostgreSQL 13+ (no pgcrypto needed).

CREATE TABLE IF NOT EXISTS brief_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- buyer (from the authenticated SIWE session)
  user_id         text NOT NULL,
  wallet_address  text NOT NULL,

  -- the order
  target          text NOT NULL,                 -- Base address or @handle to decode
  target_kind     text NOT NULL DEFAULT 'address', -- 'address' | 'handle'
  contact         text NOT NULL,                 -- where to deliver the brief
  contact_method  text NOT NULL DEFAULT 'email', -- 'email' | 'telegram' | 'x' | 'discord' | 'other'
  notes           text,

  -- commerce
  plan            text NOT NULL DEFAULT 'brief',
  amount_usdc     bigint NOT NULL,               -- micro-USDC (6 decimals) locked at order time
  status          text NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'fulfilled' | 'cancelled'
  tx_hash         text,                          -- on-chain USDC payment, set on /pay

  -- lifecycle
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  fulfilled_at    timestamptz
);

-- One paid order per on-chain tx — prevents crediting the same transfer twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brief_orders_tx_hash
  ON brief_orders (lower(tx_hash)) WHERE tx_hash IS NOT NULL;

-- Fulfillment queue: newest paid/pending first.
CREATE INDEX IF NOT EXISTS idx_brief_orders_status_created
  ON brief_orders (status, created_at DESC);

-- "My orders" lookup for the buyer.
CREATE INDEX IF NOT EXISTS idx_brief_orders_user_created
  ON brief_orders (user_id, created_at DESC);
