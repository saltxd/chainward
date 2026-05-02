# ChainWard Decoder Agent (ACP v2)

A registered service-provider agent on Virtuals' Agentic Commerce Protocol that takes paid wallet-decode jobs ($25 USDC each) and delivers JSON envelopes containing a markdown report, structured chain-grounded data, and verifiable sources.

Phase 1 of ChainWard's pivot from "alerting tool" to "intelligence platform for agent builders on Base." See [BookStack page 202](http://docs.k3s.nox/books/chainward/page/strategic-direction-intelligence-platform-pivot-2026-04-29) for the full strategic context.

---

## Status

| | |
|---|---|
| Code | ✅ Built, 84 tests passing across `packages/decode/` + `apps/acp-decoder/` |
| Local connection | ✅ Verified — `acp v2 connected` logs in ~1s against Virtuals' production |
| Agent registered on Virtuals | ✅ UUID `019de3bb-4e95-7438-b6cb-bfe68fed68ec` |
| ACP v2 migration | ✅ Confirmed via UI dialog after spec compliance check |
| Signer key rotation | ⏳ **Required before any USDC funding** — initial key was inadvertently exposed during wiring |
| Offering registered on marketplace | ⏳ Not yet — `wallet_decode @ $25 USDC fixed` planned |
| Helm secret schema | ⏳ Needs update (swap `LITE_AGENT_API_KEY` → `WALLET_ID` + `WALLET_SIGNER_PRIVATE_KEY`) |
| Production deploy (K3s) | ⏳ Pending secret update + image build |
| First buyer-side test job | ⏳ Pending deploy |
| Soft launch tweet (@chainwardai) | ⏳ Pending shipped lifecycle |

---

## Identifiers

Public, safe to share:

- **Agent UUID:** `019de3bb-4e95-7438-b6cb-bfe68fed68ec`
- **Agent wallet:** `0x55a24a57cc662e180c5bb2e0f4ee2496f5ab7127`
- **Privy wallet ID:** `t28edruo4nzkhdbzt8csicyb`
- **Dashboard:** https://app.virtuals.io/acp/agents/019de3bb-4e95-7438-b6cb-bfe68fed68ec

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

After **rotating** the signer key (see "Resume runbook" below), push the new credentials to K8s:

```bash
kubectl -n chainward create secret generic acp-decoder-secrets \
  --from-literal=WALLET_ADDRESS='0x55a24a57cc662e180c5bb2e0f4ee2496f5ab7127' \
  --from-literal=WALLET_ID='t28edruo4nzkhdbzt8csicyb' \
  --from-literal=WALLET_SIGNER_PRIVATE_KEY='<NEW key from Virtuals UI after rotation>' \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN="$(kubectl -n <ns-with-curator-secret> get secret bookstack-curator-secrets -o jsonpath='{.data.CLAUDE_CODE_OAUTH_TOKEN}' | base64 -d)"
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

1. User clicks "Confirm Workdone" in Virtuals' Upgrade-to-v2 UI dialog (asserting code-side migration complete)
2. **User rotates signer key** via the Signers tab on the dashboard. Save new key directly to 1Password — never paste in chat or log
3. Register `wallet_decode` offering at $25 USDC fixed via the new acp-cli (the legacy `openclaw-acp` CLI is deprecated; new CLI install path needs probing — likely shipped with `@virtuals-protocol/acp-node-v2` or a separate package)
4. Update `deploy/helm/chainward/templates/acp-decoder-secret.yaml` schema to swap `LITE_AGENT_API_KEY` for the three v2 fields
5. Push secrets to K3s `chainward` namespace
6. Deploy via `./deploy/deploy.sh --set acpDecoder.enabled=true`
7. Verify production logs show `acp v2 connected`
8. Buyer-side E2E test from a separate wallet ($25 USDC out, ~$22.50 back after Virtuals fee)
9. Soft launch tweet from `@chainwardai`
10. Update BookStack pages 202 and 199 with shipped state

---

## Open Items / Known TODOs

- [ ] Helm secret template still references the legacy `LITE_AGENT_API_KEY` — needs migration to v2 fields
- [ ] No real `acp-cli` installed yet — only the deprecated `openclaw-acp` is in `/tmp/openclaw-acp`. The migration guide mentioned a new `acp-cli` but its npm/install path isn't yet identified
- [ ] `apps/acp-decoder/src/seller.ts` pins `chains: [base]` to Base mainnet — fine for production, but multi-chain expansion would need adjustment
- [ ] `data-fetch.ts` falls back gracefully on individual API failures — but ACP API search-by-wallet filter (`filters[walletAddress][$eqi]=`) is empirically inferred, not docs-verified
- [ ] Persist integration tests skip without local Postgres in CI (handler unit tests still cover persist mock interactions)

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
