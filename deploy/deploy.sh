#!/usr/bin/env bash
set -euo pipefail

# deploy.sh — ChainWard deploy orchestrator
#
# Single entry point for all production deploys. Prevents drift between
# main, GHCR images, and K8s by handling migrations and rollout atomically.
#
# Usage:
#   ./deploy/deploy.sh                          # deploy current HEAD
#   ./deploy/deploy.sh --tag abc1234            # deploy specific tag
#   ./deploy/deploy.sh --migrate-only           # apply pending migrations only
#   ./deploy/deploy.sh --skip-migrate           # skip migrations, just roll out
#   ./deploy/deploy.sh --dry-run                # preview without executing
#   ./deploy/deploy.sh --dry-run --tag abc1234  # preview specific tag

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NAMESPACE="chainward"
REGISTRY="ghcr.io/saltxd"
SERVICES=(api web indexer)

# Parse args
TAG=""
MIGRATE_ONLY=false
SKIP_MIGRATE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --tag) TAG="$2"; shift 2 ;;
    --migrate-only) MIGRATE_ONLY=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      echo "Usage: deploy.sh [--tag SHA] [--migrate-only] [--skip-migrate] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --tag SHA        Image tag to deploy (default: git short SHA of HEAD)"
      echo "  --migrate-only   Run migrations without rolling out images"
      echo "  --skip-migrate   Skip migrations, just roll out images"
      echo "  --dry-run        Print what would happen without executing"
      echo "  -h, --help       Show this help"
      exit 0
      ;;
    *) echo "Unknown arg: $1. Use --help for usage." >&2; exit 1 ;;
  esac
done

# Default tag to current short SHA
if [ -z "$TAG" ]; then
  TAG=$(cd "$REPO_ROOT" && git rev-parse --short HEAD)
fi

echo "=== ChainWard Deploy ==="
echo "Tag:       $TAG"
echo "Namespace: $NAMESPACE"
echo "Time:      $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# ─── Step 1: Verify images exist in GHCR ─────────────────────────────────────

if ! $MIGRATE_ONLY; then
  echo "--- Verifying GHCR images ---"
  ALL_FOUND=true
  for svc in "${SERVICES[@]}"; do
    IMAGE="$REGISTRY/chainward-$svc:$TAG"
    if command -v crane &>/dev/null; then
      if crane manifest "$IMAGE" &>/dev/null; then
        echo "  OK  $IMAGE"
      else
        echo "  MISSING  $IMAGE" >&2
        ALL_FOUND=false
      fi
    else
      # Fallback: check via docker manifest (requires docker login)
      if docker manifest inspect "$IMAGE" &>/dev/null 2>&1; then
        echo "  OK  $IMAGE"
      else
        echo "  ??  $IMAGE (install crane for reliable verification)"
      fi
    fi
  done
  if ! $ALL_FOUND; then
    echo ""
    echo "FATAL: Some images are missing from GHCR. Wait for CI to complete." >&2
    exit 1
  fi
  echo ""
fi

# ─── Step 2: Run migrations ──────────────────────────────────────────────────

if ! $SKIP_MIGRATE; then
  echo "--- Running migrations ---"

  if $DRY_RUN; then
    echo "  [dry-run] Would create/update ConfigMap: chainward-base-schema"
    echo "  [dry-run] Would create/update ConfigMap: chainward-migrations"
    echo "  [dry-run] Would create/update ConfigMap: migration-runner"
    echo "  [dry-run] Would delete Job: chainward-migrate (if exists)"
    echo "  [dry-run] Would apply Job: chainward-migrate"
    echo "  [dry-run] Would wait for Job completion (5min timeout)"
  else
    # Create ConfigMaps from actual migration files
    echo "  Creating ConfigMap: chainward-base-schema"
    kubectl -n "$NAMESPACE" create configmap chainward-base-schema \
      --from-file="$SCRIPT_DIR/base-schema/" \
      --dry-run=client -o yaml | kubectl apply -f -

    echo "  Creating ConfigMap: chainward-migrations"
    kubectl -n "$NAMESPACE" create configmap chainward-migrations \
      --from-file="$REPO_ROOT/packages/db/src/migrations/" \
      --dry-run=client -o yaml | kubectl apply -f -

    echo "  Creating ConfigMap: migration-runner"
    kubectl -n "$NAMESPACE" create configmap migration-runner \
      --from-file=run-migrations.sh="$SCRIPT_DIR/run-migrations.sh" \
      --dry-run=client -o yaml | kubectl apply -f -

    # Delete old migration job if it exists
    echo "  Cleaning up old migration job..."
    kubectl -n "$NAMESPACE" delete job chainward-migrate --ignore-not-found

    # Apply migration job
    echo "  Starting migration job..."
    kubectl apply -f "$SCRIPT_DIR/migration-job.yaml"

    # Wait for completion (5 min timeout)
    echo "  Waiting for migration job to complete (timeout: 5m)..."
    if kubectl -n "$NAMESPACE" wait --for=condition=complete job/chainward-migrate --timeout=300s; then
      echo ""
      echo "  --- Migration logs ---"
      kubectl -n "$NAMESPACE" logs job/chainward-migrate
      echo "  --- End migration logs ---"
      echo ""
      echo "  Migrations complete."
    else
      echo ""
      echo "  --- Migration logs (FAILURE) ---"
      kubectl -n "$NAMESPACE" logs job/chainward-migrate >&2
      echo "  --- End migration logs ---"
      echo ""
      echo "FATAL: Migration job failed or timed out!" >&2
      echo "Fix the migration issue before proceeding. The app deployments were NOT changed." >&2
      exit 1
    fi
  fi
  echo ""
fi

if $MIGRATE_ONLY; then
  echo "=== Migration-only run complete ==="
  exit 0
fi

# ─── Step 3: Roll out deployments ────────────────────────────────────────────

echo "--- Rolling out deployments ---"
for svc in "${SERVICES[@]}"; do
  IMAGE="$REGISTRY/chainward-$svc:$TAG"
  if $DRY_RUN; then
    echo "  [dry-run] kubectl -n $NAMESPACE set image deployment/$svc $svc=$IMAGE"
  else
    kubectl -n "$NAMESPACE" set image "deployment/$svc" "$svc=$IMAGE"
    echo "  UPDATED  $svc -> $IMAGE"
  fi
done
echo ""

# ─── Step 4: Wait for rollouts ───────────────────────────────────────────────

if ! $DRY_RUN; then
  echo "--- Waiting for rollouts ---"
  for svc in "${SERVICES[@]}"; do
    if kubectl -n "$NAMESPACE" rollout status "deployment/$svc" --timeout=120s; then
      echo "  OK  $svc"
    else
      echo "  WARN  $svc rollout not ready after 2m — check manually" >&2
    fi
  done
  echo ""
fi

# ─── Step 5: Verify health ───────────────────────────────────────────────────

if ! $DRY_RUN; then
  echo "--- Health checks (waiting 5s for settle) ---"
  sleep 5

  # External health checks
  if curl -sf "https://api.chainward.ai/api/health" -o /dev/null 2>&1; then
    echo "  OK  api.chainward.ai/api/health"
  else
    echo "  WARN  api.chainward.ai/api/health unreachable"
  fi

  if curl -sf "https://chainward.ai/api/observatory" -o /dev/null 2>&1; then
    echo "  OK  chainward.ai/api/observatory"
  else
    echo "  WARN  chainward.ai/api/observatory unreachable"
  fi

  # Show current image versions
  echo ""
  echo "--- Current images ---"
  kubectl -n "$NAMESPACE" get deploy "${SERVICES[@]}" \
    -o custom-columns="DEPLOYMENT:.metadata.name,IMAGE:.spec.template.spec.containers[0].image,READY:.status.readyReplicas"
fi

echo ""
echo "=== Deploy complete: $TAG ==="
