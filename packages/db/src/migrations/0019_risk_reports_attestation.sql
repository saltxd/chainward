-- 0019: ChainWard Attest — each public risk report can be published as an EAS
-- attestation on Base (packages/indexer/src/workers/riskAttest.ts). The worker
-- fills these after the fact; a NULL attestation_uid means "not attested yet".
-- Design: docs/ATTEST.md

ALTER TABLE risk_reports ADD COLUMN IF NOT EXISTS attestation_uid text;
ALTER TABLE risk_reports ADD COLUMN IF NOT EXISTS attestation_tx text;
ALTER TABLE risk_reports ADD COLUMN IF NOT EXISTS attested_at timestamptz;

-- The worker's sweep: newest public reports still waiting for an attestation.
CREATE INDEX IF NOT EXISTS idx_risk_reports_unattested
  ON risk_reports (generated_at DESC)
  WHERE attestation_uid IS NULL AND is_public = true;
