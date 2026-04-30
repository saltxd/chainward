# ACP Decoder Agent — Design Spec

**Date:** 2026-04-30
**Status:** Approved (user)
**Tier:** Quick decode MVP — `$25 USDC` per job, JSON envelope delivery

## Goal

Register a paid service-provider agent on Virtuals' Agentic Commerce Protocol (ACP). The agent takes wallet-decode jobs from buyers, runs a chain-grounded audit, and delivers a JSON envelope containing a short markdown report (for humans), structured data with the ChainWard analytical lens (for machine consumers), and a sources array (for verification).

This is the smallest thing that proves we can register on ACP, accept a job, deliver an artifact, and get paid. It also dogfoods the same `/acp/new` flow we'll be teaching builders in the Phase 2 Playbook surface.

## Strategic context

This page implements Phase 1 of the strategic direction locked 2026-04-30. See [BookStack page 202](http://docs.k3s.nox/books/chainward/page/strategic-direction-intelligence-platform-pivot-2026-04-29) for full context.

In one line: **ChainWard pivots from "alerting tool" to "intelligence platform for agent builders." The decoder agent is the first dogfooded product on that pivot.**

## Architecture & job sequence

### One-time bootstrap (manual)

Run `acp setup` from `Virtual-Protocol/openclaw-acp` CLI. Browser OAuth flow → Virtuals provisions an EOA wallet for the agent and returns a `LITE_AGENT_API_KEY`. Stash the key in 1Password / equivalent, push to K8s as a Secret. Document every gotcha — this becomes the Playbook walkthrough.

### Runtime sequence

```
chainward-acp-decoder (1 K8s replica)
  │
  ▼ persistent Socket.io to acpx.virtuals.io
       (auth: { walletAddress })
  │
  ▼ event: onNewTask
       │
       ├── phase=REQUEST     → validate(wallet_address) → accept | reject(reason)
       ├── phase=NEGOTIATION → POST /requirement (request payment)
       ├── phase=TRANSACTION → quickDecode() → persist(DB) → POST /deliverable
       ├── phase=EVALUATION  → log, no action
       └── phase=COMPLETED   → escrow auto-releases ~$22.50 USDC to our wallet
```

### Reconciliation on pod restart

At startup, query in-flight jobs to catch any events missed during downtime. Exact endpoint to be discovered empirically — the brief notes `/acp/providers/jobs?phase=...` is plausible but not documented. If the endpoint doesn't exist, fall back to observability: alert if any job stays in REQUEST for >30s.

### SLA + execution watchdog

| Layer | Budget |
|---|---|
| ACP-side SLA | 15 min (job EXPIRED beyond this; refund to buyer; we get $0) |
| Internal `quickDecode()` watchdog | 5 min (kill execution; deliver `{ status: 'partial', error: 'timeout' }` if hit) |
| Pipeline normal runtime | ~30-60s (chain queries + one Claude call) |

Headroom is 5-10× normal pipeline runtime, generous for first launch.

### Reject conditions (REQUEST phase, before payment)

| Condition | Reject reason |
|---|---|
| Input doesn't match `^0x[a-fA-F0-9]{40}$` | `invalid_address` |
| Wallet has zero history on Base (Blockscout `transactions_count=0` AND `token_transfers_count=0`) | `no_history` |
| Buyer-wallet rate limit exceeded (see Concurrency & rate limits below) | `rate_limited` |

We don't reject on "we couldn't enrich it" — sparse wallets get a result with sparse data. Rejection is for impossible jobs only.

**Note on self-decode:** ChainWard's own wallets (Struktur, infrastructure addresses) are *not* rejected. Hard-rejecting them would leak our wallet allowlist via negative-space probing — a buyer could enumerate "decode this; rejected" responses to identify our addresses. Self-decodes return normal output. Anyone curious about our agents gets the same data anyone curious about anyone's agents gets. Impartiality is a strategic asset.

### Concurrency & rate limits

| Limit | Value | Rationale |
|---|---|---|
| Max concurrent decodes per pod | 3 | Initial bound; tune empirically based on sentinel/Blockscout strain |
| Per-buyer concurrent in-flight jobs | 3 | Stops a buyer with $2,500 in escrow from queueing 100 jobs we can't deliver in 15min SLA |
| Per-buyer max submitted in last 60s | 5 | Stops fast-burst submissions overwhelming the queue |
| Beyond-limit jobs at REQUEST | reject with `rate_limited` | Buyer doesn't fund escrow → no money lost on either side |
| Internal queue depth (within pod) | 10 | Beyond this, additional accepts are rejected to preserve SLA |

In-flight tracking lives in Redis (existing chainward dependency); keys keyed on `buyer_wallet`. Per-pod concurrent semaphore is in-process. None of these matter at MVP volume (10-50 jobs/month) but document now so we can tune without re-spec.

## `QuickDecodeResult` schema (the deliverable)

The deliverable is a JSON envelope with four top-level fields: `report` (markdown for humans), `data` (structured for machines), `sources` (verifiable refs), and `meta` (versioning + provenance).

### TypeScript type

```typescript
type QuickDecodeResult = {
  report: string;        // 3-5 paragraph markdown — the "human-readable wedge"

  data: {
    target: {
      input: string;                              // raw input ("0x..." or "@handle")
      wallet_address: string;                     // resolved wallet
      handle: string | null;                      // "AIxVC_Axelrod"
      name: string | null;                        // "Axelrod"
      acp_id: number | null;                      // 129
      virtuals_agent_id: number | null;
      framework: 'virtuals_acp' | 'olas' | 'eliza' | 'agentkit' | 'unknown';
      // ↑ derived from: observatory match (`observatory-agents.json` `framework` field)
      //   if found, else inferred from ACP API presence ('virtuals_acp') or 'unknown'
      owner_address: string | null;
    };

    wallet: {
      type: 'eoa' | 'erc1967_proxy' | 'erc4337' | 'contract' | 'unknown';
      nonce: number;
      code_size: number;
      is_virtuals_factory: boolean;
    };

    balances: {
      eth: { wei: string; usd: number };
      usdc: { amount: number; usd: number };
      agent_token: { symbol: string; amount: number; usd: number } | null;
    };

    activity: {
      latest_transfer_at: string | null;          // ISO 8601
      latest_transfer_age_hours: number | null;
      transfers_24h: number;
      transfers_7d: number;
      transfers_30d: number;
      unique_counterparties_30d: number;
    };

    claims: {                                     // What Virtuals API says
      agdp: number | null;
      revenue: number | null;
      successful_jobs: number | null;
      total_jobs: number | null;
      success_rate: number | null;
      last_active_at_acp: string | null;
      is_online_acp: boolean | null;
    };

    chain_reality: {
      active_today: boolean;
      active_7d: boolean;
      active_30d: boolean;
      settlement_path: string[];                  // e.g. ['payment_manager_in', 'settlement_contract_out']
      payment_manager_seen: boolean;
    };

    discrepancies: Array<{
      field: string;                              // e.g. 'lastActiveAt'
      acp_says: string;
      chain_says: string;
      severity: 'info' | 'warn' | 'critical';
      reason?: string;                            // 'migration_artifact' | 'stale_metric' | …
    }>;

    checks_performed: string[];                   // e.g. ['lastActiveAt', 'isOnline',
                                                  // 'agdp_chain_match']. Empty discrepancies
                                                  // + populated checks_performed = verified clean.
                                                  // Empty discrepancies + empty checks_performed
                                                  // = unknown / not checked. Disambiguates.

    survival: {
      classification: 'active' | 'at_risk' | 'dormant' | 'unknown';
      rationale: string;                          // short sentence
      // Note: numeric `score` deliberately not in public deliverable. Survival is opinion;
      // chain_reality is fact. Score lives internally for analytics/tuning, not exposed
      // to buyers. Adding later is easy; pulling back after launch is not.
    };

    usdc_pattern: 'running' | 'accumulating' | 'graveyard' | 'inactive' | 'unknown';

    peers: {
      similar_active: string[];                   // names from observatory matched on framework + category
      similar_dormant: string[];                  // same logic, dormant cohort
      cluster: string | null;                     // from ACP API `cluster` field (e.g. 'mediahouse')
      cluster_status: 'collapsed' | 'active' | 'mixed' | null;
      // ↑ derived: 'collapsed' if ≥75% of cluster members are dormant by our classifier
    };
  };

  sources: Array<{
    label: string;                                // e.g. "Sentinel eth_call USDC.balanceOf"
    url: string;                                  // resolvable URL or rpc:// reference
    block_number: number | null;                  // null for off-chain sources (ACP API, etc.)
    block_hash: string | null;                    // pinned hash for third-party verifiability
    timestamp: string;                            // ISO when fetched
  }>;

  meta: {
    schema_version: string;                       // semver. Bumps on QuickDecodeResult shape change.
    classifier_version: string;                   // semver. Bumps when survival/usdc-pattern/cluster
                                                  // boundaries change. Decouples shape from
                                                  // classification — same wallet decoded twice
                                                  // across versions can be diffed cleanly.
    tier: 'quick';
    pipeline_version: string;                     // git SHA
    generated_at: string;                         // ISO
    as_of_block: { number: number; hash: string };
    target_input: string;
    job_id: string;
    disclosure: string;                           // standard data-rights footer text — see below
  };
};
```

The `meta.disclosure` field carries the standard text:

> "Decode requests and results are stored by ChainWard and may inform aggregate intelligence. Individual buyer-target pairs are never disclosed."

Same string also appears in the offering description shown to buyers pre-purchase, so consent is granted before payment.

### Sample report

```markdown
# Director Lucien (ACP #59) — dormant

This Virtuals agent has been dark for **19 days** (last on-chain activity: 2026-04-11).
$74 USDC sits in the wallet. The Virtuals dashboard still shows `lastActiveAt: 2999-12-31`
— that's a backend migration artifact, not a real timestamp. Ignore it.

Lucien is part of a cluster failure. The **mediahouse** cluster collapsed April 11:
Luna went dark within hours, Sympson within 72. None of these were exploits — operators
stopped running them. Token (LUCIEN) still trades ~$24/day, so speculative interest
hasn't caught up to operational reality.

Active peers in the same swap/trade execution category include Axelrod, Otto AI, Nox,
and Capminal. None of those are in the mediahouse cluster.

[Full structured data + sources below]
```

### Report-writer voice spec

The markdown report is the buyer's first impression. Every word is the product. This subsection locks the prompt scaffold, model, and determinism guarantees so the voice doesn't drift between deliveries.

**Model:** Claude Sonnet (latest), invoked via Claude Code OAuth subscription using `claude --print` — same pattern as `scripts/auto-decode/`, bookstack-curator (K3s CronJob), and Claude_Dev (sg-scribe Discord bot). Cost: $0/decode under the OAuth subscription. NOT direct Anthropic API.

**Determinism:**
- `claude --print` invoked with deterministic prompt (no time-based variability)
- Single-turn (no tool use, no agent loop)
- Same input → same output, modulo Sonnet's inherent sampling variance (we accept ~5% prose drift between runs as the cost of LLM-generated narrative)
- For exact reproducibility (e.g., regression tests), `report-writer.ts` exposes a `replayMode: true` option that uses a deterministic stub instead of Claude — used in tests, never in production

**Prompt scaffold (locked at v1):**

```
You are a wallet decoder for ChainWard, an intelligence platform for the AI agent
economy on Base. You are writing a markdown report from VERIFIED on-chain data
about an AI agent's wallet.

Voice constraints:
- Authoritative, terse, evidence-first. Every claim must be backed by the data block.
- Never use accusatory language ("dirty", "scam", "fake", "broken"). Use neutral
  descriptive framing.
- Lead with chain reality (active_today / active_7d / active_30d).
- Then claim discrepancies (what the Virtuals dashboard says vs. what the chain says).
- Then context (peer cohort, cluster status if applicable).
- Highlight the failure mode if dormant: "operator silence, not exploit."
- 3 to 5 paragraphs. No more, no less.
- Open with a single H1: "# {name} (ACP #{id}) — {classification}".
- Markdown only. No emoji. No tables in the prose body. No bullet lists in body.

Forbidden:
- Numeric "survival scores". The schema deliberately omits them; the report must too.
- Any phrase starting "It seems", "It appears", "Likely". Be definite or omit.
- Speculation about operator intent or token holder behavior beyond what the data shows.

Data you have:
{structured_data_json}

Output format: pure markdown. No prefix, no suffix, no explanation. Begin with the H1.
```

**Versioning:** the prompt scaffold is itself a versioned asset. `report-writer.ts` exports a `PROMPT_VERSION` constant. When the prompt changes, that constant bumps and `meta.classifier_version` bumps with it (since prose framing is a classifier in the same sense as numeric thresholds).

**Failure mode:** if `claude --print` returns empty, errors, or violates the H1-format constraint, `report-writer.ts` falls back to a deterministic templated report assembled from the structured data. Empty `report` is forbidden; we always deliver SOMETHING readable.

### Special-case handlers

Specific data-quality artifacts the classifiers must explicitly handle:

| Artifact | Handler | Where |
|---|---|---|
| ACP `lastActiveAt: 2999-12-31` (Virtuals migration placeholder) | Filter from recency math entirely; emit `{ field: 'lastActiveAt', severity: 'info', reason: 'migration_artifact' }` discrepancy | `survival.ts` and `discrepancies.ts` |
| Inbound HUB token airdrops from `0xD152f549545093347A162Dce210e7293f1452150` (mass distribution 2026-04-11) | Filter from `latest_transfer_at` and `transfers_24h/7d/30d` calculations — these are unsolicited, do not represent agent activity | `chain-audit.ts` |
| ACP API returns null for `revenue` / `totalJobs` (per the dashboard audit) | Pass null through; do not infer from aGDP. `claims` reflects exactly what the API returned. | `chain-audit.ts` |

### Boundary tables (locked at classifier_version 1.0.0)

Survival classification:

| Classification | Condition |
|---|---|
| `active` | `transfers_7d ≥ 5` AND `latest_transfer_age_hours ≤ 48` |
| `at_risk` | `transfers_7d in [1, 4]` OR `latest_transfer_age_hours in (48, 168]` |
| `dormant` | `transfers_7d == 0` AND `latest_transfer_age_hours > 168` |
| `unknown` | wallet has zero history (should have rejected; this is a degenerate case) |

USDC pattern:

| Pattern | Condition |
|---|---|
| `running` | active classification AND USDC balance < $50 (continuously turning inventory) |
| `accumulating` | active classification AND USDC balance ≥ $50 (settled but not redeployed) |
| `graveyard` | dormant classification AND USDC balance ≥ $100 (the stranded-value finding) |
| `inactive` | dormant classification AND USDC balance < $100 |
| `unknown` | classification is unknown |

Cluster status:

| Status | Condition |
|---|---|
| `collapsed` | ≥75% of cluster members are dormant by survival classifier |
| `active` | ≥50% of cluster members are active by survival classifier |
| `mixed` | neither of the above |
| `null` | wallet has no `cluster` field |

The 75% / 50% thresholds are picked to surface the mediahouse-style cluster failure (4 of 5 dormant) without false-flagging mixed clusters. Tune as more cluster data accumulates; bumps `classifier_version`.

## File layout

### New code

```
apps/acp-decoder/                 ← K8s service, ACP seller runtime
  src/
    index.ts                      ← entrypoint: load config, start seller
    config.ts                     ← env vars (LITE_AGENT_API_KEY, WALLET_ADDRESS, DB, ...)
    seller.ts                     ← Socket.io client → acpx.virtuals.io, onNewTask handler
    handler.ts                    ← phase state machine: accept/requirement/execute/deliver
    persist.ts                    ← writes decode record to chainward DB
    reconcile.ts                  ← startup: query in-flight jobs, resume any we missed
  Dockerfile
  package.json                    ← deps: @virtuals-protocol/acp-node, socket.io-client,
                                    @chainward/decode, @chainward/db, @chainward/common
  tsconfig.json

packages/decode/                  ← reusable decode library
  src/
    index.ts                      ← exports quickDecode(input) → QuickDecodeResult
    types.ts                      ← QuickDecodeResult schema (with schema_version)
    chain-audit.ts                ← balances, transfers, counterparties (sentinel + Blockscout)
    resolver.ts                   ← (moved from scripts/auto-decode/lib)
    wallet-arch.ts                ← classify EOA vs ERC-1967 vs ERC-4337 vs contract
    discrepancies.ts              ← ACP claims ↔ chain truth comparator
    survival.ts                   ← active/at_risk/dormant classifier
    usdc-pattern.ts               ← running/accumulating/graveyard classifier
    peers.ts                      ← comparable peers lookup from observatory DB
    report-writer.ts              ← single Claude call to generate the markdown report
  package.json
  tsconfig.json
  vitest.config.ts
```

### Existing code that gets adapted

```
scripts/auto-decode/lib/resolver.ts    ← moved into packages/decode/, re-imported
scripts/auto-decode/                   ← still works; now imports @chainward/decode
packages/db/src/schema.ts              ← +decodes table
packages/db/src/migrations/0008_…sql   ← migration for decodes table
```

### Deployment additions

```
deploy/helm/chainward/templates/
  acp-decoder-deployment.yaml          ← new Deployment (1 replica)
  acp-decoder-secret.yaml              ← LITE_AGENT_API_KEY
deploy/helm/chainward/values.yaml      ← +acpDecoder.enabled, image tag, resources
deploy/deploy.sh                       ← add chainward-acp-decoder image to GHCR check
```

### Sizing estimate

| Module | Approx LOC | Notes |
|---|---|---|
| `apps/acp-decoder/` | ~400 | Mostly glue + state machine |
| `packages/decode/` | ~1200 | Real logic, well-tested |
| DB migration + schema | ~50 | One table |
| Helm + Dockerfile | ~80 | Standard pattern |
| Tests | ~600 | Unit tests on `packages/decode/` modules; integration on handler.ts with mocked Socket |

Roughly 2-3 days of focused work to first registration, plus 2-4 weeks of empirical iteration as we learn ACP behavior in production.

## Error handling

### Partial-failure handling during `quickDecode()`

| Failure | Behavior |
|---|---|
| Sentinel RPC timeout | retry once (5s), then fall through with `wallet.type='unknown'`, log warn |
| Blockscout 5xx | retry once with backoff, then deliver with `activity` flagged `degraded: true` |
| ACP API down (acpx.virtuals.io) | `claims = null`, report notes "Virtuals API unavailable" |
| `report-writer` Claude call fails | deliver structured data with empty `report` field; better than failing the job entirely |
| DB persist fails | NEVER fail the buyer job. Log error, retry asynchronously via a small queue. Buyer gets their deliverable on time. |

**Principle: always deliver something.** Partial delivery beats EXPIRED (refund + reputation hit). We get paid 90-95% on partial; $0 on expiry.

### Pod restart / reconciliation

- On startup, query in-flight jobs (endpoint TBD empirically). Resume any we missed.
- Handler is idempotent: re-accepting an accepted job is a no-op; re-delivering an already-delivered job is safe.
- Persist phase transitions to DB on each step — recovery looks at our DB to know where each job is.
- SIGTERM: stop accepting new jobs (graceful flag), finish current jobs, close socket, exit. Standard K8s graceful-shutdown.

### Buyer-side rejection

- Evaluator or buyer can reject our deliverable → we lose the $25.
- Log every rejection with full job context. If we see ≥3 in a week, that's signal we're delivering something wrong.
- Don't auto-retry rejections.

### Observability

| Type | What |
|---|---|
| Structured logs (pino, JSON) | every state transition, every external call result, every reject |
| Metrics (Prometheus) | `acp_jobs_accepted_total`, `acp_jobs_completed_total`, `acp_jobs_rejected_total{reason}`, `acp_decode_duration_seconds`, `acp_socket_connected{}` |
| Alerts | Socket disconnected >2min, job stuck in any phase >5min, `acp_jobs_rejected_total{reason}` rate >0.1/min |
| Dashboard | Grafana panel under existing chainward dashboards: job throughput, rejection breakdown, decode runtime p50/p99 |

## Persistence

### DB schema (new migration `0008_decodes_table.sql`)

```sql
CREATE TABLE decodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        text UNIQUE NOT NULL,           -- ACP job id
  buyer_wallet  text NOT NULL,                  -- who paid us
  target_input  text NOT NULL,                  -- raw input ("0x..." or "@handle")
  target_wallet text NOT NULL,                  -- resolved wallet
  tier          text NOT NULL DEFAULT 'quick',  -- 'quick' | 'full' | 'deep' (forward-compat)
  status        text NOT NULL,                  -- 'accepted' | 'delivered' | 'rejected' | 'failed'
  result        jsonb,                          -- the QuickDecodeResult (null if rejected/failed)
  reject_reason text,                           -- when status='rejected'
  fee_usdc      numeric(10,2),                  -- 25.00 typically
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  settled_at    timestamptz                     -- when escrow released
);

CREATE INDEX idx_decodes_buyer ON decodes(buyer_wallet, accepted_at DESC);
CREATE INDEX idx_decodes_target ON decodes(target_wallet);
CREATE INDEX idx_decodes_status_accepted ON decodes(status, accepted_at DESC);
```

Not a TimescaleDB hypertable — volume is too low to need partitioning (we'll be lucky to hit 100/month for a long time).

### Indexes match expected query patterns

- `idx_decodes_buyer` → "show me a buyer's history" (future enterprise dashboard)
- `idx_decodes_target` → "who has decoded this wallet" (future analytics)
- `idx_decodes_status_accepted` → "show me recent jobs by status" (operational monitoring)

## Secrets

```yaml
# deploy/helm/chainward/templates/acp-decoder-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: acp-decoder-secrets
type: Opaque
stringData:
  LITE_AGENT_API_KEY: "<from acp setup>"
  WALLET_ADDRESS: "<provisioned by Virtuals>"
  CLAUDE_CODE_OAUTH_TOKEN: "<copy from existing chainward/curator/discord-bot Secret — same token>"
```

Created manually after `acp setup` runs. Never committed to git. The `CLAUDE_CODE_OAUTH_TOKEN` is the same token already used by `auto-decode`, `bookstack-curator`, and `Claude_Dev` — when it expires (~2027-04-02 per memory), all four services rotate together.

Same pattern as existing chainward secrets.

## Helm chart additions

```yaml
# values.yaml
acpDecoder:
  enabled: false   # opt-in; flip after first acp setup completes
  image: ghcr.io/saltxd/chainward-acp-decoder
  replicas: 1
  resources:
    requests: { cpu: 100m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }
```

Single Deployment, 1 replica. Socket.io affinity matters; if we ever need HA, leader election would be required.

## CI / image build

Add `chainward-acp-decoder` to the existing GitHub Actions workflow that builds api/web/indexer. New Dockerfile in `apps/acp-decoder/`. `deploy.sh` already polls GHCR for image readiness — add this image to its check list.

The Dockerfile installs the **Claude Code CLI** as a runtime dep so `report-writer.ts` can `spawn('claude', ['--print', …])`. Same pattern as the bookstack-curator image. Install path: download the official Claude Code binary in the build stage and copy into the runtime image. Verify with `claude --version` during build.

## Service definition (ACP offering)

Registered via `acp sell create wallet_decode`. The offering JSON the buyer sees pre-purchase:

```json
{
  "name": "wallet_decode",
  "description": "Verified on-chain audit of an AI agent wallet on Base. Returns chain-grounded balances, activity, dashboard discrepancies, peer cohort analysis, and a short readable report. ChainWard's intelligence layer surfaces what the platform's own dashboard doesn't show. Decode requests and results are stored by ChainWard and may inform aggregate intelligence; individual buyer-target pairs are never disclosed.",
  "jobFee": 25,
  "jobFeeType": "fixed",
  "requiredFunds": false,
  "requirement": {
    "type": "object",
    "required": ["wallet_address"],
    "properties": {
      "wallet_address": {
        "type": "string",
        "description": "EVM wallet address to audit (0x + 40 hex chars). Agent name accepted via @handle."
      },
      "agent_name": {
        "type": "string",
        "description": "Optional: Virtuals agent name for metadata enrichment."
      }
    }
  }
}
```

The data-rights disclosure in the description is what a buyer sees before spending $25. By submitting the job, the buyer consents. This is also reflected in `meta.disclosure` on the deliverable for record.

## Testing strategy

| Layer | Test type | Coverage |
|---|---|---|
| `packages/decode/` modules | **Unit (vitest)** | Each function pure or fully-mocked: `chain-audit`, `wallet-arch`, `discrepancies`, `survival`, `usdc-pattern`, `peers`, `report-writer`. Mock sentinel/Blockscout/ACP responses with realistic fixtures captured from 2026-04-29 research. Survival classifier needs ≥10 fixture cases (active/dormant/at-risk boundary). Target: 80%+ line coverage. |
| `packages/decode/index.ts` `quickDecode()` | **Integration (vitest)** | Real fixture inputs (Axelrod active, Lucien dormant, Ethy borderline) → assert output shape matches `QuickDecodeResult`, all sources resolvable, `schema_version` present. Use captured data, not network calls. |
| `apps/acp-decoder/handler.ts` | **State-machine tests** | Mock Socket.io events for each phase transition. Verify accept/reject paths, idempotency, partial-failure fallthroughs, watchdog timeout. |
| `apps/acp-decoder/persist.ts` | **DB integration** | Real Postgres (test container) — verify upserts, idempotency on `job_id` collision, status transitions. |
| End-to-end | **Manual, post-deploy** | Run `acp setup` once. Submit a job to ourselves from a separate test buyer wallet. Verify full lifecycle: accept → pay → execute → deliver → settle. Decode our own internal test wallet. Stash artifacts as integration regression set. |

### Fixtures from 2026-04-29 investigations

- Active examples: Axelrod, Otto AI, Nox, Capminal
- Dormant examples: Lucien, Luna, Sympson, Ethy, ButlerLiquid
- Edge cases: agents with HUB airdrop spam (false-positive recency), 2999-12-31 timestamps (migration artifact), zero-history wallets

These become `packages/decode/__tests__/fixtures/*.json` so tests run hermetically.

### What we don't test

- Live ACP behavior — empirical, learned in production
- Claude `report-writer` output prose quality — we test that it returns *something* in the right shape, not literary quality. Voice gets refined post-launch from real outputs.
- Long-running job stability — covered by observability + alerts, not unit tests.

## Future considerations (deferred)

The cold-store analytics layer (Postgres → Parquet → Cloudflare R2 → DuckDB) is out of scope for this MVP. Deferred to Phase 3 when we ship the Map dashboard and public API. See [BookStack page 204 — Future Analytics Layer](http://docs.k3s.nox/books/chainward/page/future-analytics-layer-parquetduckdbobject-storage-deferred) for the full thinking.

Until that phase: Postgres only. Adding object storage now would 2× deploy complexity for zero current benefit.

## Open empirical questions

These are documented for post-launch discovery, not blockers for shipping:

1. **$25 minimum fee.** Not validated. Test registration will confirm.
2. **SLA tightening.** Start at 15 min; tune based on production p99.
3. **Reconciliation endpoint.** `/acp/providers/jobs?phase=...` is plausible; needs empirical confirmation.
4. **Evaluator opt-in.** Whether buyers can force evaluator review (and the resulting 5% deduction) is undocumented.
5. **Discoverability.** How buyers find our agent on the marketplace — keyword vs semantic search.
6. **Console vs CLI registration.** Whether `https://app.virtuals.io/acp/new` Self-hosted flow and `acp setup` create the same record type. Likely yes; needs confirmation.

## Success criteria for MVP launch

The MVP is shipped when ALL of the following are true:

1. `acp setup` completed; agent registered on Virtuals with `chainward-decoder` listing
2. K8s Deployment running, Socket.io connected, observability green
3. End-to-end test passed: we submit a job to ourselves, full lifecycle completes, deliverable matches schema
4. First 24h of operation runs cleanly without crash loops or stuck jobs
5. Soft launch announcement on `@chainwardai` X account
6. **Playbook walkthrough committed to `docs/playbook/acp-registration-walkthrough.md`** — every step, error, gotcha, and resolution from the `acp setup` flow. This is the seed for `/build`'s "How to launch on Virtuals" page in Phase 2. The strategic value of going first leaks unless captured at the time.

Shipped does NOT mean "we generated revenue." Zero jobs in month one is a market signal, not a failure of the launch — the counter-cyclical thesis treats every job as accumulated data, not a per-unit revenue line. Discoverability concerns are deliberately not gating; they're a Phase 1.5 marketing concern, not a launch concern.

## References

- ACP service-provider technical brief: `scripts/auto-decode/acp-service-brief.md`
- Strategic direction: BookStack page 202
- Future analytics layer (deferred): BookStack page 204
- Auto-decode pipeline (Full-tier engine): BookStack page 199
- Reference implementation: `Virtual-Protocol/openclaw-acp` (CLI), `moonshot-cyber/virtuals-acp` (best example)
- SDK: `@virtuals-protocol/acp-node` v0.3.0-beta.40
