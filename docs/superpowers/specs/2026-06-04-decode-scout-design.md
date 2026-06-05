# Decode Scout — Design Spec

**Date:** 2026-06-04
**Status:** APPROVED (v1 scope locked after adversarial hardening) — proceeding to implementation plan
**Author:** brainstormed with Claude; hardened against the live codebase by a 30-agent review workflow (2026-06-04)

## Problem

ChainWard already has the content *machinery* — the [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) ships a full article + tweet autonomously from a single `decode <target>` trigger. What's missing is the thing that decides **what's worth decoding** and **keeps the cadence going**. The [GTM plan](http://docs.k3s.nox/books/automation-integration/page/gtm-todos-distribution-plays) (P2) calls for "1 decode/week" off a manually-maintained backlog, and names the lever: *"find ONE provable, screenshotable thing nobody else caught"* (Wasabot's $81M aGDP / ~$0 revenue gap).

That's a **detection** problem. The scout that finds the anomaly *is* the growth engine. Today the pipeline is a loaded gun with nobody pulling the trigger on a schedule. There's already a *manual* predecessor — the `/scout` slash-command (`~/.claude/commands/scout.md`) and `scripts/decode-candidates.ts` (`pnpm decode:candidates`). This spec **automates that** as a scheduled, pull-shaped agent.

## Goal

A weekly agent that surfaces the **top decode candidate** (ranked by anomaly × reach over ChainWard's own DB) to a Discord channel with a **copy-paste-ready trigger command**, for one-tap approval. Pull-shaped (only pings when there's a real candidate). **Zero Claude quota** in v1. The human tap is the verification gate; the decode pipeline's own gauntlet is the deep verifier.

## Non-goals

- NOT a daily research digest (user is already over-notified; more push = negative value).
- NOT autonomous publishing — the public ChainWard voice is gated behind a human tap. "Submission authority, not merge authority."
- NOT a replacement for the Auto-Decode Pipeline — it *surfaces a candidate + command*; the user triggers the unchanged pipeline.
- NOT a general homelab agent-scout (different concern).
- **NOT an LLM pre-verifier in v1** (cut after hardening — see Scope).

## Scope: v1 = Detector + Ping (Claude pre-verify CUT)

The original 3-stage design (detect → Claude pre-verify → ping) was thinned after the hardening review. **v1 is detector + ping only.** Rationale:
- The decode pipeline's verification gauntlet **already re-derives every claim from the target address**, so a scout "proof" is never load-bearing for what ships — worst case of a wrong scout number is a wasted human tap, which the user gates.
- Cutting the Claude stage removes the Claude-bearing Docker image, OAuth secret, MCP config, sentinel-fallback, model-pin, and brittle `claude --print` stdout parsing — i.e. all the fragile/expensive parts — for near-zero quality loss.
- v1 runs on the **existing indexer image** (already bundles `@chainward/db` + `@chainward/observatory`, already consumes `DATABASE_URL`). No new image, no GHCR/OCI plumbing, **zero Claude quota.**

**Deferred to v2 (only if real-world false-positive rate proves the DB numbers mislead — unlikely):** LLM pre-verify against cw-sentinel; the `dormant_but_hyped` signal; `claimed_vs_onchain_supply`; external holder/follower reach. If v2 pre-verify is ever built, reuse the **acp-decoder image**, do not build a new one.

## Data contract (corrected against the live schema — the original spec was wrong here)

> The first draft cited `getLeaderboard()` and `acpData.totalAgdp/totalRevenue`. Both are wrong. Corrected:

- **Source of truth: the `acp_agent_data` table** (schema `packages/db/src/schema/acpData.ts`), queried **directly** via `createDb(process.env.DATABASE_URL)`. Do NOT call `getLeaderboard()` (returns 4 top-10 arrays, no revenue/aGDP) and do NOT call `getEconomics()` at runtime (capped `LIMIT 50`, filtered to `successful_job_count > 0` — biases away from the zero-revenue outliers we hunt). Use `getEconomics()`'s SQL (`observatoryService.ts:537-570`) as a **reference only**.
- **Per-agent columns the detector uses** (db column names):
  - `gross_agentic_amount` (numeric, nullable) — this is "aGDP". POPULATED. Can hit the `99,999,999.99` cap (treat cap as a flag).
  - `revenue` (numeric, **frequently NULL**) — the gap denominator; NULL handling is load-bearing (see below).
  - `unique_buyer_count` (integer) — **primary REACH proxy.** `transaction_count` (integer) — secondary/tiebreak.
  - `name` (text), `wallet_address` (text, NOT NULL, unique), `twitter_handle` (text, nullable), `has_graduated` (bool), `is_online` (bool), `wallet_balance` (text), `success_rate` (numeric; can exceed 100 = data artifact), `successful_job_count` (int), `last_active_at`, `last_synced_at` (NOT NULL, synced ~6h).
- **Ecosystem totals** (`acp_ecosystem_metrics`: `total_agdp`, `total_revenue`, …) are NOT per-agent; only used for context if needed.
- **`daily_agent_health.score`** exists **only for observatory/graduated agents** (`is_observatory=true AND is_public=true`), NOT the full ACP universe — which is exactly why `dormant_but_hyped` can't fire on the non-observatory high-aGDP discoveries that are the point. → deferred to v2.
- **No holder-count, follower-count, or token-supply columns exist anywhere.** Reach must be `unique_buyer_count`/`transaction_count`. (True audience size would need an external Blockscout/Virtuals fetch — v2.)

## Anomaly signal (v1 = ONE proven signal, NULL-safe)

**Signal: aGDP/revenue gap.** Compute as `gross_agentic_amount / NULLIF(CAST(revenue AS numeric), 0)`.
- **NULL or 0 revenue → separate "unmeasurable-revenue" bucket**, NOT infinite gap (the Wasabot pattern is high aGDP + ~0/NULL revenue — flag it, don't let it become +Inf and dominate).
- **Clamp `revenue > aGDP` rows** (ratio < 1) as data-quality artifacts → not anomalies.
- **Scale floor: `gross_agentic_amount >= $5,000`** so micro-agents with near-zero denominators don't produce phantom million-× gaps.
- Reuse the manual scout's **proven thresholds** (from `~/.claude/commands/scout.md`): ratio > 100×, revenue > $50K, `gross_agentic_amount == 99,999,999.99` cap, `revenue == NULL`. Do not invent new ones.

**Reach:** `reach = unique_buyer_count` (primary) with `transaction_count` as tiebreak.
**Ranking key:** `juice = anomaly_score × reach` (port the weighting from `scripts/decode-candidates.ts` — outlier-aGDP/job 0.30, brand-vs-onchain 0.30, audience 0.25, recency 0.15 — adapted to DB columns).

## Architecture (v1)

```
weekly K3s CronJob (chainward ns, indexer image, schedule 0 8 * * 1 — Mon 08:00, away from the 04-05/10:00 cluster)
  │  concurrencyPolicy: Forbid · backoffLimit: 0 · restartPolicy: Never
  │  activeDeadlineSeconds: 600 · startingDeadlineSeconds: 200 · pullPolicy: Always
  │
  ├─ STAGE 1 — DETECT   [pure SQL over acp_agent_data; ZERO Claude, ZERO chain calls]
  │    • createDb(DATABASE_URL); single lean query (pool max=10 is shared + saturates — run sequential)
  │    • Compute per-agent: anomaly (NULL-safe aGDP/revenue gap, $5k floor, clamp, cap-flag),
  │      reach (unique_buyer_count), juice = anomaly × reach
  │    • MALFUNCTION GUARD: 0 rows returned, or gross_agentic_amount entirely NULL across the
  │      pool → treat as FAILURE (fire loud to ops), NOT "no candidate"
  │    • Dedup:
  │        - permanent skip: agent already decoded — recover decoded NAME set from
  │          deliverables/*/*.md frontmatter `title` (lowercase, strip " on-chain|deep dive|decode",
  │          normalize) — mirror decode-candidates.ts:52-77. Do NOT assume slugify(name)==dirname.
  │        - cooldown skip: wallet_address in scout_surfaced with surfaced_at > now()-interval '4 weeks'
  │    • Pick TOP 1 by juice
  │
  ├─ STAGE 2 — PING   [Discord webhook POST; copy prober's send_discord shape]
  │    to SCOUT_DISCORD_WEBHOOK (#decode-scout):
  │    "🔭 Decode candidate: <name>
  │     Anomaly: $<aGDP> aGDP vs $<revenue|'no on-chain revenue'> — <ratio>× gap
  │     Reach: <unique_buyer_count> unique on-chain buyers (<transaction_count> txs)
  │     Ship it → send to Claude_Dev:
  │       decode 0x<wallet_address>            ← always (address path skips ACP lookup)
  │       decode @<name>                       ← ONLY if name matches /^@[A-Za-z0-9_-]+$/"
  │    • record in scout_surfaced AFTER 2xx webhook response (deliver-then-record)
  │
  └─ HEARTBEAT (every run, to OPS webhook — distinct from #decode-scout)
       "scout ran: <N> scanned, top juice=<X>, candidate=<name|none>"
       + ALL failures (DB error, empty/all-NULL result, webhook non-2xx) → loud OPS alert

  ── USER (async, one action) ──
  user sends to Claude_Dev (DM or @mention surface it watches):  decode 0x<addr>
  │
  └─ Claude_Dev (UNCHANGED) → pnpm decode:auto <target> → full pipeline → article + tweet
```

## Components (v1)

| Component | What | Where (new unless noted) |
|---|---|---|
| **Detector** | Pure-SQL anomaly×reach over `acp_agent_data`; NULL-safe gap; dedup. No LLM. | `scripts/decode-scout/detect.ts` |
| **Dedup** | decoded-name recovery from `deliverables/*/*.md` frontmatter + `scout_surfaced` cooldown | `scripts/decode-scout/dedup.ts` |
| **Ping** | Discord webhook POST (prober `send_discord` shape); address-primary command | `scripts/decode-scout/ping.ts` |
| **Entrypoint** | detect → pick → ping → record; heartbeat + loud failure routing | `scripts/decode-scout/index.ts` (`pnpm scout:run`) |
| **State table** | `scout_surfaced(wallet_address PK, slug, surfaced_at)` | new migration `packages/db/src/migrations/00NN_scout_surfaced.sql` (mirror `prober_state` / migration 0012) |
| **CronJob** | weekly trigger | `deploy/helm/chainward/templates/decode-scout-cronjob.yaml` (copy `prober-cronjob.yaml`, swap image→indexer) |
| **Ship trigger** | UNCHANGED `decode <target>` via Claude_Dev | reuses [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) |

Net-new code is small: one SQL query, dedup, a webhook POST, a migration, a CronJob manifest. Everything else is reuse.

## Token / quota budget

**v1 uses ZERO Claude quota** (pure SQL + webhook). The only Claude spend in the whole flow is the decode pipeline itself (~8–12 sessions), which **only fires on the user's tap** — the user is the gate. Scout can NEVER autonomously trigger a decode (safety invariant below). Kill switch = `kubectl patch cronjob decode-scout -p '{"spec":{"suspend":true}}'`.

## Safety invariant (replaces the refuted "auto-fire" blocker)

The scout's anti-auto-fire guarantee, verified during hardening, depends on two facts and is locked by a regression test:
1. The scout posts via a **webhook** and does **NOT** emit a real `<@CLAUDE_USER_ID>` mention. Claude_Dev's bot-filter patch drops webhook-authored messages lacking a genuine user-ID mention.
2. Claude_Dev's `decode` matcher is **DM/@mention-scoped**, not channel-scanning.
→ A `#decode-scout` post can never trigger a decode. **Test:** assert the scout's rendered ping contains no `<@\d+>` mention pattern.

## Error handling (fail LOUD, never silent)

- **No candidate clears threshold** → no candidate ping, but STILL send the heartbeat ("candidate=none"). Silence is correct *for candidates*, never for *the run*.
- **DB error / 0 rows / all-NULL anomaly column** → **loud OPS alert** (malfunction), distinct from "quiet market."
- **Webhook non-2xx** → retry w/ backoff; on final failure → OPS alert; do NOT record `surfaced_at` (so the candidate isn't buried behind cooldown by a delivery failure).
- **Two channels:** candidates → `SCOUT_DISCORD_WEBHOOK` (#decode-scout); heartbeat + all failures → `OPS_DISCORD_WEBHOOK` (daily-ops). Assert both env vars present at startup.

## Testing

- **Detector: deterministic unit tests** (mirror `scripts/auto-decode/lib/__tests__/`, 23-test pattern). Fixture rows: a Wasabot-shaped gap (high aGDP, NULL revenue), a clamp case (`revenue > aGDP`), a micro-agent below the $5k floor, a boring agent, a `99,999,999.99`-cap agent. Assert ranking, threshold, NULL-bucket, dedup (decoded-name recovery + cooldown).
- **Safety regression test:** rendered ping contains no `<@\d+>` mention.
- **Dedup test:** the real `deliverables/` slug set (`wasabot-decode`, `ethy-ai-decode`, `aixbt`, `bankr-hack-trace`, …) is correctly recognized as decoded via frontmatter-title recovery (NOT slugify-dirname).
- **e2e dry run:** scout run posting to a TEST webhook; confirm message format + that the emitted `decode 0x…` command actually resolves in `scripts/auto-decode` (validators.parseTarget accepts the address).

## Cadence expectation (verified, sign-off)

The addressable backlog is **small and finite**: ~7 undecoded agents at `aGDP>=$5k` & gap>=10×; ~13 at `aGDP>=$1k` (threshold-dependent estimate). So this is **"drain a small backlog over ~2 months, then degrade to a change-detector"** that fires only when a *new* high-aGDP agent appears. Post-backlog silence is the NORMAL, correct state — not a bug. (Monthly-yield is a reasonable estimate, not a guarantee.)

## Resolved decisions (user approved 2026-06-04)

1. **Host → K3s CronJob, `chainward` ns, indexer image.** In-cluster DB access, Phoenix-traceable, fleet reliability conventions (locked below). Scout never runs the pipeline → needs nothing sg-scribe-local.
2. **cw-sentinel** → N/A in v1 (no chain calls; deferred with Stage-2).
3. **Dedup** → decoded = permanent (frontmatter-name recovery); surfaced-not-shipped = 4-week cooldown (`scout_surfaced` DB table, NOT a JSON file — cron pods are ephemeral).
4. **Thresholds** → v1 = aGDP/revenue gap only (NULL-safe). `dormant_but_hyped` + `supply_mismatch` deferred (no full-universe data).
5. **Channels** → `SCOUT_DISCORD_WEBHOOK` (#decode-scout, candidates) + `OPS_DISCORD_WEBHOOK` (daily-ops, heartbeat/failures). Both patched into the **manually-managed `chainward-secrets`** out-of-band (NOT Helm-managed), mirroring how `PROBER_DISCORD_WEBHOOK` was added.

### CronJob conventions (non-optional)
`concurrencyPolicy: Forbid`, `backoffLimit: 0`, `restartPolicy: Never`, `activeDeadlineSeconds: 600`, `startingDeadlineSeconds: 200`, `pullPolicy: Always`. Copy `prober-cronjob.yaml`, NOT `postgres-backup-cronjob.yaml` (the latter is the non-conforming template).

## Open items needing the user (not build blockers, but deploy blockers)

1. **Discord channels + webhooks:** create `#decode-scout`, get its webhook URL; confirm the ops/heartbeat webhook (reuse the existing daily-ops one). Patch both into `chainward-secrets` (`SCOUT_DISCORD_WEBHOOK`, and `OPS_DISCORD_WEBHOOK` if not already present) — out-of-band kubectl, like `PROBER_DISCORD_WEBHOOK`.
2. **Reply target:** the ping posts to `#decode-scout`, but Claude_Dev does NOT read that channel — so the ping's command must be copy-paste-ready for the surface Claude_Dev *does* watch (DM or its @mention channel). Confirm which, so the ping copy says "send this to Claude_Dev" not "reply here."
3. **Cadence sign-off:** accept the small-finite-backlog reframe (post-backlog silence = normal).

## Related

- [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) — the unchanged ship path
- [GTM TODOs — Distribution Plays](http://docs.k3s.nox/books/automation-integration/page/gtm-todos-distribution-plays) — P2 this automates
- `~/.claude/commands/scout.md` + `scripts/decode-candidates.ts` — the manual predecessors to port
- [BookStack Curator](http://docs.k3s.nox/books/automation-integration/page/bookstack-curator) — cron host pattern
