# Sentinel Node Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point ChainWard at the self-hosted Base node (cw-sentinel), keep Alchemy as fallback, re-enable the fund flow tracer rewritten to use standard RPC, and uncap tracing to 200 agents.

**Architecture:** Swap K8s secret so BASE_RPC_URL points to sentinel (192.168.1.194:8545), Alchemy becomes BASE_RPC_FALLBACK_URL. Viem's fallback transport already handles automatic failover. Rewrite the ACP wallet tracer from Alchemy-specific `alchemy_getAssetTransfers` to standard `eth_getLogs` (ERC20 Transfer events) + `eth_getTransactionReceipt` via the viem client. This removes the only Alchemy-specific RPC dependency in the indexer.

**Tech Stack:** viem, BullMQ, K8s secrets, Helm

---

## File Map

### Modified Files

**Task 1 — K8s RPC Config:**
- Modify: K8s secret via `kubectl` (runtime, not in repo)
- Modify: `deploy/helm/chainward/templates/secret.yaml` (documentation only)

**Task 2 — Rewrite Tracer:**
- Modify: `packages/indexer/src/workers/acpWalletTracer.ts` — replace `alchemy_getAssetTransfers` with viem `getLogs`

**Task 3 — Re-enable Tracer + Uncap:**
- Modify: `packages/indexer/src/index.ts` — uncomment imports and worker creation
- Modify: `packages/indexer/src/workers/acpWalletTracer.ts` — change topN from 50 to 200

---

## Task 1: Update K8s RPC Secret

**Files:**
- Runtime: K8s secret `chainward-secrets` in `chainward` namespace
- Docs: `deploy/helm/chainward/templates/secret.yaml`

- [ ] **Step 1: Get the current Alchemy RPC URL from the secret**

```bash
ssh mburkholz@192.168.1.230 'kubectl get secret -n chainward chainward-secrets -o jsonpath="{.data.BASE_RPC_URL}" | base64 -d'
```

Save this value — it becomes the fallback.

- [ ] **Step 2: Update the K8s secret**

```bash
ssh mburkholz@192.168.1.230 'kubectl patch secret -n chainward chainward-secrets --type=json -p="[
  {\"op\":\"replace\",\"path\":\"/data/BASE_RPC_URL\",\"value\":\"$(echo -n "http://192.168.1.194:8545" | base64)\"},
  {\"op\":\"add\",\"path\":\"/data/BASE_RPC_FALLBACK_URL\",\"value\":\"$(echo -n "<ALCHEMY_URL>" | base64)\"}
]"'
```

Replace `<ALCHEMY_URL>` with the current Alchemy URL from Step 1.

- [ ] **Step 3: Update secret.yaml documentation**

Update `deploy/helm/chainward/templates/secret.yaml` to document the new pattern:
```
--from-literal=BASE_RPC_URL=http://192.168.1.194:8545 \
--from-literal=BASE_RPC_FALLBACK_URL=https://base-mainnet.g.alchemy.com/v2/<key> \
```

- [ ] **Step 4: Commit documentation change**

```bash
git add deploy/helm/chainward/templates/secret.yaml
git commit -m "docs: update secret template — sentinel as primary RPC, Alchemy as fallback"
```

---

## Task 2: Rewrite Fund Flow Tracer to Use Standard RPC

**Files:**
- Modify: `packages/indexer/src/workers/acpWalletTracer.ts`

The current `traceWallet()` function (lines 142-207) uses `alchemy_getAssetTransfers` via raw `fetch()`. Replace it with standard `eth_getLogs` for ERC20 Transfer events via the viem client, plus `getBlock` for native ETH transfers.

- [ ] **Step 1: Replace the traceWallet function**

Replace the entire `traceWallet()` function (lines 142-207) and update the import to use the viem client:

Add import at top of file:
```typescript
import { getBaseClient } from '../lib/viem.js';
import { parseAbiItem, type Address } from 'viem';
```

Replace `traceWallet()` with:

```typescript
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function traceWallet(
  acpWallet: string,
): Promise<{ address: string; txCount: number; totalValue: number } | null> {
  const client = getBaseClient();
  const currentBlock = await client.getBlockNumber();
  // Scan last 30 days (~1.3M blocks at 2s/block)
  const fromBlock = currentBlock - BigInt(1_296_000);

  // Fetch ERC20 Transfer events FROM this wallet
  const logs = await client.getLogs({
    event: TRANSFER_EVENT,
    args: { from: acpWallet as Address },
    fromBlock: fromBlock > 0n ? fromBlock : 0n,
    toBlock: 'latest',
  });

  if (logs.length === 0) return null;

  // Count destination wallets (excluding known contracts)
  const destCounts = new Map<string, { count: number; totalValue: number }>();

  for (const log of logs) {
    const to = (log.args.to ?? '').toLowerCase();
    if (!to || EXCLUDE_ADDRESSES.has(to)) continue;

    const entry = destCounts.get(to) ?? { count: 0, totalValue: 0 };
    entry.count++;
    // value is in raw units — normalize later if needed
    entry.totalValue += Number(log.args.value ?? 0n) / 1e18;
    destCounts.set(to, entry);
  }

  if (destCounts.size === 0) return null;

  // Find the most frequent destination
  let topDest = '';
  let topCount = 0;
  let topValue = 0;

  for (const [addr, { count, totalValue }] of destCounts) {
    if (count > topCount) {
      topDest = addr;
      topCount = count;
      topValue = totalValue;
    }
  }

  // Only return if there's a clear pattern (>= 2 transfers to same address)
  if (topCount < 2) return null;

  return { address: topDest, txCount: topCount, totalValue: topValue };
}
```

- [ ] **Step 2: Update traceTopAgents to not pass rpcUrl**

In `traceTopAgents()`, line 70 currently passes `rpcUrl`:
```typescript
const candidate = await traceWallet(agent.wallet_address, rpcUrl);
```

Change to:
```typescript
const candidate = await traceWallet(agent.wallet_address);
```

Also remove the `rpcUrl` variable and the check at lines 30-35:
```typescript
const rpcUrl = process.env.BASE_RPC_URL;
if (!rpcUrl) { ... }
```

The viem client handles the RPC URL internally.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: 11/11 pass

- [ ] **Step 4: Commit**

```bash
git add packages/indexer/src/workers/acpWalletTracer.ts
git commit -m "refactor: rewrite fund flow tracer to use standard eth_getLogs via viem

Replace Alchemy-specific alchemy_getAssetTransfers with standard
ERC20 Transfer event logs via viem client. Uses getLogs with
fromBlock scan (30 days). No Alchemy dependency — works on any
Base RPC including self-hosted sentinel node."
```

---

## Task 3: Re-enable Tracer + Uncap to 200 Agents

**Files:**
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/src/workers/acpWalletTracer.ts`

- [ ] **Step 1: Uncomment all tracer lines in index.ts**

Line 12-13: Uncomment the import:
```typescript
import { createAcpWalletTracerWorker, setupAcpWalletTracerSchedule } from './workers/acpWalletTracer.js';
```

Line 29-30: Uncomment worker creation:
```typescript
const acpTracer = createAcpWalletTracerWorker();
```

Line 40-41: Uncomment schedule setup:
```typescript
await setupAcpWalletTracerSchedule(redis);
```

Line 55: Uncomment shutdown:
```typescript
acpTracer.close(),
```

Remove all `// DISABLED: CU emergency` comments.

- [ ] **Step 2: Change topN from 50 to 200**

In `acpWalletTracer.ts`:

Line 217 (default in worker):
```typescript
const topN = job.data.topN ?? 200;
```

Line 243 (daily schedule):
```typescript
await queue.add('trace-top', { type: 'trace', topN: 200 }, {
```

Line 249 (initial trace):
```typescript
await queue.add('initial-trace', { type: 'trace', topN: 200 }, {
```

Line 253 (log message):
```typescript
logger.info('ACP wallet tracer scheduled (daily 03:00 UTC, top 200 agents)');
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
```

```bash
git add packages/indexer/src/index.ts packages/indexer/src/workers/acpWalletTracer.ts
git commit -m "feat: re-enable fund flow tracer, uncap to 200 agents

No more CU limits — sentinel node handles all RPC calls.
Daily trace at 03:00 UTC covers top 200 ACP agents by revenue."
```

---

## Task 4: Deploy and Monitor

- [ ] **Step 1: Push and wait for GHCR build**

```bash
git push origin main
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

- [ ] **Step 2: Restart API and indexer to pick up new secret values**

The secret change doesn't require a new image — just a rollout restart:

```bash
./deploy/deploy.sh --tag $(git rev-parse --short HEAD) --skip-migrate
```

This deploys the new tracer code AND restarts pods to pick up the updated secret.

- [ ] **Step 3: Verify RPC is hitting sentinel**

Check indexer logs for balance polling (runs every 5 min):
```bash
ssh mburkholz@192.168.1.230 'kubectl logs -n chainward <indexer-pod> --tail=30 -f'
```

Look for:
- Balance polls completing without errors → sentinel is serving eth_getBalance
- No "fallback" or "retry" messages → not falling back to Alchemy
- Tracer logs: "Starting ACP wallet fund flow tracing" with count > 0

- [ ] **Step 4: Monitor for 15 minutes**

Watch for:
- Balance polling every 5 min (should see 3 cycles)
- No RPC errors
- Tracer initial run (triggered on startup)
- Webhook processing (if any agents transact)
