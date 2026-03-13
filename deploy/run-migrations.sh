#!/usr/bin/env bash
set -euo pipefail

# run-migrations.sh — Idempotent migration runner for ChainWard
#
# Applies SQL migration files tracked by a schema_migrations table.
# Mounts expect:
#   /base-schema/*.sql  — base table definitions (applied first)
#   /migrations/*.sql   — incremental migrations (applied in filename order)
#
# On first run against an existing DB (set up before the runner existed),
# the runner detects already-applied files via artifact checks and records
# them without re-running. This is critical because TimescaleDB's
# CREATE MATERIALIZED VIEW IF NOT EXISTS still validates cagg-on-cagg
# queries, causing failures on re-run.
#
# Environment:
#   DATABASE_URL — required, PostgreSQL connection string

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"

echo "=== ChainWard Migration Runner ==="
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Wait for PostgreSQL
echo ""
echo "--- Waiting for PostgreSQL ---"
RETRIES=0
MAX_RETRIES=30
until pg_isready -d "$DATABASE_URL" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "FATAL: PostgreSQL not ready after ${MAX_RETRIES} attempts" >&2
    exit 1
  fi
  sleep 2
done
echo "PostgreSQL is ready."

# Create tracking table
echo ""
echo "--- Initializing schema_migrations ---"
psql "$DATABASE_URL" -q -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"

# Track results
APPLIED=0
SKIPPED=0
FAILED=0

record_as_applied() {
  local version="$1"
  psql "$DATABASE_URL" -q -c "INSERT INTO schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;"
  echo "  RECORD: $version (artifact exists, marked as applied)"
  SKIPPED=$((SKIPPED + 1))
}

apply_file() {
  local file="$1"
  local version
  version=$(basename "$file")

  # Check if already tracked
  local tracked
  tracked=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM schema_migrations WHERE version = '${version}';")

  if [ "$tracked" = "1" ]; then
    echo "  SKIP: $version (already applied)"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo "  APPLYING: $version ..."
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" 2>&1; then
    psql "$DATABASE_URL" -q -c "INSERT INTO schema_migrations (version) VALUES ('${version}');"
    echo "  OK: $version"
    APPLIED=$((APPLIED + 1))
  else
    echo "  FAIL: $version" >&2
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Check if a file's primary artifact already exists in the DB.
# Returns "t" if the artifact exists (safe to skip), "f" if not (must run).
artifact_exists() {
  local version="$1"
  case "$version" in
    01-schema.sql)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users');" ;;
    02-timescale.sql)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'transactions');" ;;
    0001_*)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'gas_analytics_hourly');" ;;
    0002_*)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_registry' AND column_name = 'is_public');" ;;
    0003_*)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_registry' AND column_name = 'is_observatory');" ;;
    0004_*)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'known_contracts');" ;;
    0005_*)
      psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_agent_health');" ;;
    *)
      echo "f" ;;
  esac
}

# For each file: if already tracked in schema_migrations, skip.
# If not tracked but artifact exists in DB, record without running.
# Otherwise, run the migration.
apply_or_record() {
  local file="$1"
  local version
  version=$(basename "$file")

  # Check if already tracked
  local tracked
  tracked=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM schema_migrations WHERE version = '${version}';")

  if [ "$tracked" = "1" ]; then
    echo "  SKIP: $version (already applied)"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  # Check if artifact already exists (DB predates the migration runner)
  local exists
  exists=$(artifact_exists "$version")

  if [ "$exists" = "t" ]; then
    record_as_applied "$version"
    return 0
  fi

  # Run the migration
  echo "  APPLYING: $version ..."
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" 2>&1; then
    psql "$DATABASE_URL" -q -c "INSERT INTO schema_migrations (version) VALUES ('${version}');"
    echo "  OK: $version"
    APPLIED=$((APPLIED + 1))
  else
    echo "  FAIL: $version" >&2
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Apply base schema files
if [ -d /base-schema ]; then
  echo ""
  echo "--- Base Schema ---"
  for f in $(ls /base-schema/*.sql 2>/dev/null | sort); do
    apply_or_record "$f"
  done
fi

# Apply incremental migrations
if [ -d /migrations ]; then
  echo ""
  echo "--- Incremental Migrations ---"
  for f in $(ls /migrations/*.sql 2>/dev/null | sort); do
    apply_or_record "$f"
  done
fi

# Summary
echo ""
echo "=== Migration Summary ==="
echo "Applied: $APPLIED"
echo "Skipped: $SKIPPED"
echo "Failed:  $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "FATAL: $FAILED migration(s) failed!" >&2
  exit 1
fi

echo ""
echo "All migrations complete."
