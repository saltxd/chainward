# ChainWard Decoder Agent (ACP v2)

A registered service-provider agent on Virtuals' Agentic Commerce Protocol that takes paid wallet-decode jobs (planned launch price: $10 USDC; raise after volume signal) and delivers JSON envelopes containing a markdown report, structured chain-grounded data, and verifiable sources.

Phase 1 of ChainWard's pivot from "alerting tool" to "intelligence platform for agent builders on Base." See [BookStack page 202](http://docs.k3s.nox/books/chainward/page/strategic-direction-intelligence-platform-pivot-2026-04-29) for the full strategic context.

---

## Status

| | |
|---|---|
| Code | ✅ Built, 84 tests passing across `packages/decode/` + `apps/acp-decoder/` |
| Agent registered on Virtuals | ✅ UUID `019dee5e-bfca-79bb-add9-6d8bb38d91f3` (display name `Chainward`, wallet `0x7eae90d4...`) |
| Offering registered on marketplace | ✅ `walletDecode @ $10 USDC fixed, 5min SLA` |
| Helm secret schema (v2) | ✅ Migrated — `WALLET_ADDRESS / WALLET_ID / WALLET_SIGNER_PRIVATE_KEY` + `CLAUDE_CODE_OAUTH_TOKEN` |
| Production deploy (K3s) | ✅ Live on `05e960d` — pod 1/1 Running, smart wallet deployed via EIP-7702 |
| Production logs visible | ✅ `kubectl logs deployment/acp-decoder` |
| End-to-end paid lifecycle | ✅ **Job 5424 (2026-05-03)**: created → budget.set → funded → submitted → completed; $9 USDC received by seller wallet, real chain-grounded decode delivered |
| Soft launch tweet (@chainwardai) | ⏳ Pending |

---

## Identifiers

Public, safe to share:

- **Seller agent UUID** (`Chainward`, our service-provider): `019dee5e-bfca-79bb-add9-6d8bb38d91f3`
- **Seller wallet:** `0x7eae90d4aac511491694e2f1854db54f53d59e92`
- **Privy wallet ID:** `dt14bea23m0alqlou6pxxvtm`
- **walletDecode offering ID:** `019dee79-204e-7608-a8cf-0fe634d64979`
- **Buyer agent UUID** (`chainward-decoder`, our test client): `019de3bb-4e95-7438-b6cb-bfe68fed68ec`
- **Buyer wallet:** `0x88d181346cd79c1631adf03a87d97e9d425bf9f8`
- **Dashboard:** https://app.virtuals.io/acp/agents/019dee5e-bfca-79bb-add9-6d8bb38d91f3

> **Retired seller (do not use):** UUID `019de3c0-349c-7d7c-8ef3-78cf06318ffc`, wallet `0x55a24a57cc662e180c5bb2e0f4ee2496f5ab7127`. Created via the deprecated `openclaw-acp` flow on 2026-05-01 — got tagged `cluster: OPENCLAW` and `lastActiveAt: 2999-12-31` sentinel, which causes the v2 backend to auto-reject every incoming job with reason `invalid_address`. Migration to the fresh agent (above) on 2026-05-03 fixed it. Always create v2 agents via the canonical `acp agent create` command from `Virtual-Protocol/acp-cli` (GitHub) — never `openclaw-acp` (npm `virtuals-protocol-acp`).

---

## Architecture

```
                                 Virtuals ACP v2 (acpx.virtuals.io)
                                          │
                                          │ Socket transport (SSE/WebSocket)
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │                       AcpAgent                         │
              │  (PrivyAlchemyEvmProviderAdapter + Privy + Alchemy)    │
              │     non-custodial wallet, P256 signer authenticates    │
              └───────────────────────────┬───────────────────────────┘
                                          │ on("entry", handler)
                                          ▼
                          ┌──────────────────────────────────┐
                          │         handleEntry()            │
                          │                                  │
                          │  message + contentType:          │
                          │     "requirement"                │
                          │     ↓                            │
                          │   validateRequest                │
                          │   rateLimiter.tryAcquire         │
                          │   chainHistory.checkHistory      │
                          │   session.setBudget(USDC@$25)    │
                          │   persistAccepted                │
                          │                                  │
                          │  system + event.type:            │
                          │     "job.funded"                 │
                          │     ↓                            │
                          │   quickDecode()                  │
                          │     ↓                            │
                          │   session.submit(JSON)           │
                          │   persistDelivered               │
                          │     ↓                            │
                          │   rateLimiter.release            │
                          │                                  │
                          │  watchdog: 5min Promise.race     │
                          └──────────────────────────────────┘
                                          │
                                          ▼
                  ┌────────────────────────────────────────────┐
                  │         @chainward/decode (lib)            │
                  │                                            │
                  │   quickDecode(input)                       │
                  │     ↓                                      │
                  │   data-fetch (live):                       │
                  │     • sentinel RPC (cw-sentinel:8545)      │
                  │     • Blockscout (transfers, counters)     │
                  │     • ACP API (acpx.virtuals.io)           │
                  │     • GeckoTerminal (token data)           │
                  │   classifiers:                             │
                  │     • wallet-arch                          │
                  │     • survival                             │
                  │     • usdc-pattern                         │
                  │     • peers + cluster_status               │
                  │     • discrepancies                        │
                  │   report-writer (claude --print, OAuth)    │
                  │     ↓                                      │
                  │   QuickDecodeResult JSON envelope          │
                  └────────────────────────────────────────────┘
```

---

## Configuration

Required environment variables (all loaded by `config.ts`):

| Variable | Description | Source |
|---|---|---|
| `WALLET_ADDRESS` | Agent EVM wallet address | Virtuals UI / Signers tab |
| `WALLET_ID` | Privy wallet ID | Virtuals UI / Signers tab |
| `WALLET_SIGNER_PRIVATE_KEY` | P256 PEM signer key | Virtuals UI / Signers tab (one-shot reveal) |
| `DATABASE_URL` | Postgres connection string | K3s `chainward-secrets` |
| `REDIS_URL` | Redis connection string | K3s `chainward-secrets` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token (for report-writer) | Same as `bookstack-curator` / `Claude_Dev` |
| `DEFAULT_CHAIN_ID` | Default chain (8453 Base mainnet) | Defaults to 8453 |
| `SENTINEL_RPC` | Internal sentinel RPC URL | `http://cw-sentinel:8545` (default) |
| `MAX_CONCURRENT_DECODES` | Per-pod concurrency limit | Default `3` |
| `PER_BUYER_INFLIGHT_LIMIT` | Per-buyer in-flight job cap | Default `3` |
| `PER_BUYER_SUBMISSION_LIMIT_60S` | Per-buyer submission rate (60s window) | Default `5` |
| `LOG_LEVEL` | pino log level | Default `info` |

---

## Development

```bash
# from worktree root
pnpm install

# typecheck the package
pnpm --filter @chainward/acp-decoder typecheck

# unit tests (handler, config, rate-limit, data-fetch)
pnpm --filter @chainward/acp-decoder test

# build emit
pnpm --filter @chainward/acp-decoder build

# run locally — REQUIRES env vars (see Configuration table)
pnpm --filter @chainward/acp-decoder dev
```

Persist tests skip without a local Postgres on port 5433. To run them:

```bash
docker run -d --name chainward-test-db -p 5433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=chainward_test \
  postgres:16
pnpm --filter @chainward/acp-decoder test
docker stop chainward-test-db && docker rm chainward-test-db
```

---

## Deployment

K3s namespace: `chainward`. Helm chart: `deploy/helm/chainward/`.

### Step 1 — Push secrets

The signer private key is backed up at `~/.config/chainward-secrets/acp-decoder-signer.json` (mode 600, gitignored). Apply to K8s:

```bash
PRIV=$(jq -r .privateKey ~/.config/chainward-secrets/acp-decoder-signer.json)
kubectl -n chainward create secret generic acp-decoder-secrets \
  --from-literal=WALLET_ADDRESS='0x7eae90d4aac511491694e2f1854db54f53d59e92' \
  --from-literal=WALLET_ID='dt14bea23m0alqlou6pxxvtm' \
  --from-literal=WALLET_SIGNER_PRIVATE_KEY="$PRIV" \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN="$(kubectl -n <ns-with-curator-secret> get secret bookstack-curator-secrets -o jsonpath='{.data.CLAUDE_CODE_OAUTH_TOKEN}' | base64 -d)" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n chainward rollout restart deployment/acp-decoder
```

### Step 2 — Update Helm secret schema

The Helm template at `deploy/helm/chainward/templates/acp-decoder-secret.yaml` still references the legacy `LITE_AGENT_API_KEY`. Update to declare `WALLET_ADDRESS`, `WALLET_ID`, `WALLET_SIGNER_PRIVATE_KEY` instead. (Pending — see Open Items.)

### Step 3 — Build image + deploy

```bash
git push origin acp-decoder         # triggers GitHub Actions image build
# wait for ghcr.io/saltxd/chainward-acp-decoder:<sha>
./deploy/deploy.sh --set acpDecoder.enabled=true
kubectl -n chainward logs -l app.kubernetes.io/component=acp-decoder --tail=50
# Expected: "acp v2 connected"
```

---

## Resume Runbook (after context compaction)

If you're a future Claude session picking this up cold, read in this order:

1. **`docs/superpowers/specs/2026-04-30-acp-decoder-agent-design.md`** — the design spec (locked)
2. **`docs/superpowers/plans/2026-04-30-acp-decoder-agent.md`** — the implementation plan (locked)
3. **`docs/playbook/acp-registration-walkthrough.md`** — what we learned during Virtuals registration (live capture, includes EconomyOS-vs-legacy gotcha + the v2 migration step)
4. **`scripts/auto-decode/acp-service-brief.md`** — original ACP brief (some sections outdated — superseded by the v2 migration; treat as historical context)
5. **BookStack page 202** (chainward.k3s.nox) — strategic positioning + 4 sonnet investigation findings
6. **BookStack page 199** — auto-decode pipeline (the engine that became this product)
7. **Migration guide** — https://github.com/Virtual-Protocol/acp-node-v2/blob/main/migration.md (the canonical SDK reference)

### Operational state at last commit on `acp-decoder` branch

- Code is ACP v2 compliant (matches the migration guide checklist + canonical seller example)
- Local connection to Virtuals production verified
- Signer key rotation has NOT happened yet — original key was leaked during wiring debug
- No offering registered on the marketplace yet
- Not deployed to K3s

### Next-up tasks (in order)

**All pre-launch infra complete.** Remaining steps before public launch:

1. Fund a separate buyer wallet with $10 USDC + send a real `walletDecode` order to validate the full happy path produces a Claude-rendered markdown report and on-chain settlement (~$1 net cost per test)
2. Soft launch tweet from `@chainwardai`
3. Update BookStack pages 202 and 199 with shipped state

---

## SDK Patches (load-bearing — DO NOT REMOVE)

Two `pnpm patch` files in `patches/` work around real bugs in pre-release Alchemy/Virtuals tooling. They survive `pnpm install` via `package.json` `pnpm.patchedDependencies`. Both must be in place — without either, the seller's first `setBudget` call will fail.

### `patches/@alchemy__wallet-api-types@0.1.0-alpha.30.patch`

**Bug**: `HexBigInt.Encode` (in `dist/esm/schemas.js`) added a strict `typeof value !== "bigint"` check on 2026-05-01 (alpha.30 release). The companion `@alchemy/wallet-apis@5.0.0-beta.25` still emits some HexBigInt-typed fields as plain `number 0` — most reliably during the EIP-7702 deployment + first userOp combined call (`count: 2` signed prepared calls), where `prepareCalls` returns numeric defaults that survive `Optional` decode and fail the strict re-encode.

**Fix**: coerce `number → BigInt(number)` at the codec boundary before the strict type check. Equivalent semantics for the wire format.

### `patches/@alchemy__wallet-apis@5.0.0-beta.25.patch`

**Bug**: `sendPreparedCalls` in `dist/esm/actions/sendPreparedCalls.js` round-trips signed prepared calls through `encode(schema.request, fullParams)`. The `PreparedCall_UserOpV070_Signed` schema explicitly `Type.Omit`s `feePayment`, but the SDK's signing pass doesn't strip it from the runtime value before passing it to `sendPreparedCalls`.

**Fix**: walk `fullParams` and drop any `feePayment` keys before encode.

### Why we can't just upgrade

Working v2 sellers in the wild (Wasabot, Capminal, MORSE) all deployed before alpha.30 landed and are pinned to older versions via their lockfiles. Alpha.30 is the only published version of `wallet-api-types` that has this regression. We're shipping the day the regression landed; bypass via patch until Virtuals/Alchemy ship a fix upstream.

### What to do when the upstream fix lands

1. Bump `@virtuals-protocol/acp-node-v2` to whatever new version pulls a fixed `@alchemy/wallet-api-types` (likely alpha.31+).
2. Delete `patches/@alchemy__wallet-api-types@*.patch` and `patches/@alchemy__wallet-apis@*.patch`.
3. Remove the `pnpm.patchedDependencies` block from root `package.json`.
4. `pnpm install` and verify a fresh seller wallet (use `chainward-decoder`'s pattern — generate a new test agent and try `setBudget` end-to-end before declaring victory).

## Open Items / Known TODOs

- [x] ~~Logs not surfacing in `kubectl logs`~~ — fixed in commit e596ca5 by bundling the SDK via tsup `noExternal`, dropping the `--import tsx/esm` loader. With the SDK pre-bundled, esbuild rewrites the SDK's broken extensionless imports at build time and Node's pipe stdio works normally. Required a `createRequire(import.meta.url)` banner so CJS transitive deps (object-inspect, side-channel, deep-equal) can resolve `require('node:util')` from inside the ESM bundle.
- [x] ~~Helm secret template still references the legacy `LITE_AGENT_API_KEY`~~ — migrated 2026-05-01 to v2 fields.
- [x] ~~Seller `setBudget` throws "Expected bigint, got: 0" on first userOp~~ — fixed via the two `pnpm patch` files documented above.
- [x] ~~No real `acp-cli` needed~~ — v2 offering registration is dashboard-only; for buyer-side testing, install `Virtual-Protocol/acp-cli` from GitHub (not on npm).
- [ ] `apps/acp-decoder/src/seller.ts` pins `chains: [base]` to Base mainnet — fine for production, but multi-chain expansion would need adjustment.
- [ ] `data-fetch.ts` falls back gracefully on individual API failures — but the ACP API search-by-wallet filter (`filters[walletAddress][$eqi]=`) is empirically inferred, not docs-verified.
- [ ] Persist integration tests skip without local Postgres in CI (handler unit tests still cover persist mock interactions).
- [ ] CI doesn't build the `acp-decoder` image (private mirror only). Production image is built locally via `docker buildx build --platform linux/amd64 ... --push`.

---

## File map

```
apps/acp-decoder/
  src/
    index.ts          ← entrypoint: loads config, builds HandlerContext, starts AcpAgent
    config.ts         ← env var loader
    seller.ts         ← AcpAgent.create + on("entry", ...) + agent.start()
    handler.ts        ← handleEntry: dispatches on entry shape (message vs system)
    persist.ts        ← Drizzle queries: persistAccepted/Delivered/Rejected/Settled
    rate-limit.ts     ← Redis-backed per-buyer + in-process per-pod limits
    data-fetch.ts     ← live fixtures from sentinel + Blockscout + ACP + GeckoTerminal
    logger.ts         ← pino logger
  __tests__/
    config.test.ts
    handler.test.ts
    rate-limit.test.ts
    persist.test.ts   ← skips without local Postgres
    data-fetch.test.ts
  Dockerfile          ← multi-stage build, installs Claude Code CLI in runner
  package.json
  tsconfig.json

packages/decode/      ← the reusable decode library (consumed by both this agent and the auto-decode pipeline)
  src/
    index.ts          ← barrel
    types.ts          ← QuickDecodeResult schema (schema_version 1.0.0)
    quick-decode.ts   ← integration entry point
    chain-audit.ts
    wallet-arch.ts
    survival.ts
    usdc-pattern.ts
    discrepancies.ts
    peers.ts
    spam-tokens.ts
    token-trading.ts
    sentinel-block.ts
    report-writer.ts  ← claude --print + replayMode + fallback
    resolver.ts       ← @handle / 0xADDRESS → canonical wallet
    templates/
      report-fallback.md.ts
  __tests__/
    fixtures/         ← captured chain + ACP responses (Axelrod, Lucien, Otto, Ethy, Luna)

deploy/helm/chainward/templates/
  acp-decoder-deployment.yaml
  acp-decoder-secret.yaml   ← needs v2 schema update (see TODO above)
deploy/deploy.sh            ← already wires acp-decoder into image checks + rollout

docs/
  superpowers/specs/2026-04-30-acp-decoder-agent-design.md
  superpowers/plans/2026-04-30-acp-decoder-agent.md
  playbook/acp-registration-walkthrough.md
```

---

## License

MIT (matches parent `chainward` repo).

This README is the canonical orientation doc for the agent. The git remote `private` (`saltxd/chainward-acp-decoder`) holds the WIP branch; `origin` (`saltxd/chainward`, public MIT) is where work merges to `main` once shipped.
