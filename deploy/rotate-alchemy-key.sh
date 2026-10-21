#!/usr/bin/env bash
# Rotate the Alchemy API key used by api, indexer and swap-agent.
#
# 1. In the Alchemy dashboard, create a new key for the Base app and copy it.
# 2. Run this script. It reads the key from the clipboard (so it never lands in
#    shell history or a terminal transcript), tests it, patches
#    chainward-secrets (BASE_RPC_URL + ALCHEMY_API_KEY), restarts the
#    deployments that read it, and updates the encrypted seed in homelab-k3s
#    and the local .env.
# 3. Once the pods are healthy, commit + push the seed in homelab-k3s, then
#    delete the old key in the Alchemy dashboard.
#
# Prints key fingerprints only, never key values. kubectl runs locally when the
# cluster API answers, otherwise on $KUBE_HOST over ssh (the Mac can't reach
# :6443). Secret values travel over stdin, never on a command line.
set -euo pipefail

NS=chainward
SECRET=chainward-secrets
DEPLOYMENTS=(api indexer swap-agent)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="${SEED:-$HOME/Homelab/homelab-k3s/apps/chainward/secrets.enc.yaml}"
KUBE_HOST="${KUBE_HOST:-sg-scribe}"

editor=""
clip_read=""
cleanup() { [[ -n "$clip_read" ]] && pbcopy </dev/null; [[ -n "$editor" ]] && rm -f "$editor"; return 0; }
trap cleanup EXIT

if kubectl version --request-timeout=3s >/dev/null 2>&1; then
  k() { kubectl "$@"; }
else
  k() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$KUBE_HOST" "kubectl $(printf '%q ' "$@")"; }
fi

fp() { printf %s "$1" | shasum -a 256 | cut -c1-12; }

new_key="$(pbpaste | tr -d '[:space:]')"
if [[ ! "$new_key" =~ ^[A-Za-z0-9_-]{20,64}$ ]]; then
  echo "Clipboard does not look like an Alchemy API key. Copy the new key and re-run." >&2
  exit 1
fi
clip_read=1

old_url="$(k -n "$NS" get secret "$SECRET" -o 'jsonpath={.data.BASE_RPC_URL}' | base64 -d)"
old_key="${old_url##*/v2/}"
if [[ -z "$old_key" || "$old_key" == "$old_url" ]]; then
  echo "Could not read the current BASE_RPC_URL from $SECRET." >&2
  exit 1
fi
if [[ "$new_key" == "$old_key" ]]; then
  echo "Clipboard holds the current (leaked) key, not a new one." >&2
  exit 1
fi
new_url="${old_url%/v2/*}/v2/${new_key}"

echo "old key fp: $(fp "$old_key")"
echo "new key fp: $(fp "$new_key")"

echo -n "Testing new key with eth_blockNumber... "
block_hex="$(curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$new_url" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"])')" || {
  echo "failed. Is the key enabled for Base mainnet?" >&2
  exit 1
}
echo "ok (block $((block_hex)))"

NEW_URL="$new_url" NEW_KEY="$new_key" python3 -c '
import base64, json, os
b64 = lambda s: base64.b64encode(s.encode()).decode()
print(json.dumps({"data": {"BASE_RPC_URL": b64(os.environ["NEW_URL"]), "ALCHEMY_API_KEY": b64(os.environ["NEW_KEY"])}}))
' | k -n "$NS" patch secret "$SECRET" --type merge --patch-file=/dev/stdin >/dev/null
echo "Patched $SECRET (BASE_RPC_URL, ALCHEMY_API_KEY)."

for d in "${DEPLOYMENTS[@]}"; do
  k -n "$NS" rollout restart "deployment/$d" >/dev/null
done
for d in "${DEPLOYMENTS[@]}"; do
  k -n "$NS" rollout status "deployment/$d" --timeout=300s
done

if [[ -f "$SEED" ]] && command -v sops >/dev/null && command -v yq >/dev/null; then
  editor="$(mktemp)"
  cat >"$editor" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
yq -i '(select(.metadata.name == "chainward-secrets") | .data.ALCHEMY_API_KEY) = (strenv(NEW_KEY) | @base64) | (select(.metadata.name == "chainward-secrets") | .data.BASE_RPC_URL) = (strenv(NEW_URL) | @base64)' "$1"
EOF
  chmod +x "$editor"
  NEW_URL="$new_url" NEW_KEY="$new_key" EDITOR="$editor" sops edit "$SEED"
  seed_fp="$(sops -d "$SEED" | yq 'select(.metadata.name == "chainward-secrets") | .data.ALCHEMY_API_KEY | @base64d' | tr -d '\n' | shasum -a 256 | cut -c1-12)"
  echo "Updated the homelab-k3s seed (ALCHEMY_API_KEY fp $seed_fp). Commit + push it."
else
  echo "Seed not updated (needs $SEED, sops and yq). Re-seed it by hand." >&2
fi

if [[ -f "$REPO_ROOT/.env" ]] && grep -qF -- "$old_key" "$REPO_ROOT/.env"; then
  OLD_KEY="$old_key" NEW_KEY="$new_key" python3 -c '
import os, pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text().replace(os.environ["OLD_KEY"], os.environ["NEW_KEY"]))
' "$REPO_ROOT/.env"
  echo "Updated local .env."
fi

echo "Clipboard cleared on exit. Now delete the old key (fp $(fp "$old_key")) in the Alchemy dashboard."
