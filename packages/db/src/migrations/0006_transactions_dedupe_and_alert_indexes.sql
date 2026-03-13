-- Enforce transaction idempotency at the database layer.
-- Timescale hypertables require the partition column (`timestamp`) to be part
-- of any unique constraint, so we include it in the ingest fingerprint.

-- Remove compression policy temporarily so compressed chunks can be decompressed
-- before we add a unique constraint.
SELECT remove_compression_policy('transactions', if_exists => TRUE);

-- Decompress existing chunks so the unique constraint can be created safely.
SELECT decompress_chunk(chunk, true)
FROM show_chunks('transactions') AS c(chunk);

-- Keep the earliest copy of any duplicate ingest fingerprint before adding the
-- DB-level uniqueness guarantee.
WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY
        timestamp,
        chain,
        tx_hash,
        block_number,
        wallet_address,
        direction,
        status,
        counterparty,
        token_address,
        amount_raw,
        contract_address,
        method_id
      ORDER BY ingested_at ASC
    ) AS rn
  FROM transactions
)
DELETE FROM transactions t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_ingest_unique'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_ingest_unique
      UNIQUE NULLS NOT DISTINCT (
        timestamp,
        chain,
        tx_hash,
        block_number,
        wallet_address,
        direction,
        status,
        counterparty,
        token_address,
        amount_raw,
        contract_address,
        method_id
      );
  END IF;
END $$;

-- Alert dedupe checks look up by (config, trigger tx hash).
CREATE INDEX IF NOT EXISTS idx_alert_events_config_trigger_tx
  ON alert_events (alert_config_id, trigger_tx_hash, timestamp DESC)
  WHERE trigger_tx_hash IS NOT NULL;

-- Restore the compression policy after the constraint is in place.
SELECT add_compression_policy('transactions', INTERVAL '7 days', if_not_exists => TRUE);
