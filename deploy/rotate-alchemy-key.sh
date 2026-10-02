#!/usr/bin/env bash
# Rotate the Alchemy API key used by api, indexer and swap-agent.
#
# 1. In the Alchemy dashboard, create a new key for the Base app and copy it.
# 2. Run this script. It reads the key from the clipboard (so it never lands in
#    shell history or a terminal transcript), tests it, patches
#    chainward-secrets (BASE_RPC_URL + ALCHEMY_API_KEY), restarts the
#    deployments that read it, and updates the local .env.
# 3. Once the pods are healthy, delete the old key in the Alchemy dashboard.
#
# Prints key fingerprints only, never key values.
set -euo pipefail

NS=chainward
SECRET=chainward-secrets
DEPLOYMENTS=(api indexer swap-agent)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fp() { printf %s "$1" | shasum -a 256 | cut -c1-12; }

new_key="$(pbpaste | tr -d '[:space:]')"
if [[ ! "$new_key" =~ ^[A-Za-z0-9_-]{20,64}$ ]]; then
  echo "Clipboard does not look like an Alchemy API key. Copy the new key and re-run." >&2
  exit 1
fi

old_url="$(kubectl -n "$NS" get secret "$SECRET" -o jsonpath='{.data.BASE_RPC_URL}' | base64 -d)"
old_key="${old_url##*/v2/}"
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

kubectl -n "$NS" patch secret "$SECRET" --type merge -p "$(python3 - "$new_url" "$new_key" <<'EOF'
import base64, json, sys
url, key = sys.argv[1], sys.argv[2]
b64 = lambda s: base64.b64encode(s.encode()).decode()
print(json.dumps({"data": {"BASE_RPC_URL": b64(url), "ALCHEMY_API_KEY": b64(key)}}))
EOF
)" >/dev/null
echo "Patched $SECRET (BASE_RPC_URL, ALCHEMY_API_KEY)."

for d in "${DEPLOYMENTS[@]}"; do
  kubectl -n "$NS" rollout restart "deployment/$d" >/dev/null
done
for d in "${DEPLOYMENTS[@]}"; do
  kubectl -n "$NS" rollout status "deployment/$d" --timeout=300s
done

if [[ -f "$REPO_ROOT/.env" ]] && grep -q "$old_key" "$REPO_ROOT/.env"; then
  python3 - "$REPO_ROOT/.env" "$old_key" "$new_key" <<'EOF'
import pathlib, sys
p, old, new = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
p.write_text(p.read_text().replace(old, new))
EOF
  echo "Updated local .env."
fi

pbcopy </dev/null
echo "Clipboard cleared. Now delete the old key (fp $(fp "$old_key")) in the Alchemy dashboard."
