-- 0023: x402_settlements — one row per settled x402 payment (the paid counterparty
-- check, the seller check, dataset files). Written by the API's onAfterSettle hook,
-- so it only holds payments that settled after the handler succeeded. Pod logs don't
-- survive a deploy; this is the record of who bought what.
-- NOT a hypertable.

CREATE TABLE IF NOT EXISTS x402_settlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash       text NOT NULL,
  network       text NOT NULL,                -- CAIP-2, e.g. eip155:8453
  payer         text,
  pay_to        text NOT NULL,
  asset         text NOT NULL,
  amount        bigint NOT NULL,              -- atomic units (USDC: 6 decimals)
  route         text,                         -- the matched route pattern
  path          text,                         -- the request path + query that was paid for
  settled_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_x402_settlements_tx_hash
  ON x402_settlements (lower(tx_hash));

CREATE INDEX IF NOT EXISTS idx_x402_settlements_settled_at
  ON x402_settlements (settled_at DESC);
