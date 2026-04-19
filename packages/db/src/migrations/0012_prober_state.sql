-- Tracks the prober's current alert state so it can emit RESOLVED messages on recovery
-- and avoid duplicate fires while an incident is ongoing.
CREATE TABLE IF NOT EXISTS prober_state (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
