-- Tracks decode candidates the scout has SURFACED (pinged) so it doesn't re-ping
-- the same wallet within the cooldown window. Cron pods are ephemeral — state
-- must live in the DB, not a file. Mirrors prober_state (migration 0012).
CREATE TABLE IF NOT EXISTS scout_surfaced (
  wallet_address text PRIMARY KEY,
  slug          text,
  surfaced_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scout_surfaced_at ON scout_surfaced (surfaced_at);
