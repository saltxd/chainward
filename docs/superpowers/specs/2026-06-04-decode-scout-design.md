# Decode Scout — Design Spec

**Date:** 2026-06-04
**Status:** APPROVED — proceeding to implementation plan
**Author:** brainstormed with Claude

## Problem

ChainWard already has the content *machinery* — the [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) ships a full article + tweet autonomously from a single `decode @<agent>` trigger. What's missing is the thing that decides **what's worth decoding** and **keeps the cadence going**. The [GTM plan](http://docs.k3s.nox/books/automation-integration/page/gtm-todos-distribution-plays) (P2) calls for "1 decode/week for 10 weeks" off a manually-maintained backlog, and names the actual lever: *"find ONE provable, screenshotable thing nobody else caught"* (Wasabot's $81M aGDP / $5.9k revenue gap; AIXBT's fake supply).

That's a **detection** problem, not a content problem. The scout that finds the anomaly *is* the growth engine. Today the pipeline is a loaded gun with nobody pulling the trigger on a schedule.

## Goal

A weekly agent that surfaces **one confirmed, high-impact decode candidate** to Discord for one-tap approval, then lets the existing pipeline ship it. Pull-shaped (only pings when it found something genuinely worth shipping — no spam), uses ChainWard's own infra end-to-end, and is quota-safe by construction.

## Non-goals

- NOT a daily research digest (user is already over-notified; more push = negative value).
- NOT autonomous publishing — the public ChainWard voice (tweet from @chainwardai, article on site) is gated behind a human tap. "Submission authority, not merge authority."
- NOT a replacement for the Auto-Decode Pipeline — it *triggers* it, unchanged.
- NOT a general agent-scout for the homelab fleet (different concern).

## Design decisions (locked in brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| **Signal** | Anomaly × Reach | A provable gap only travels if the agent is big enough to amplify it. Juicy anomaly on a 200-holder nobody = tree in empty forest; same gap on AIXBT's 412k holders = viral repost. |
| **Pre-verify** | Yes, lightweight | User doesn't want to dig in manually. Scout confirms the anomaly is real + screenshotable *before* pinging, so each ping is "confirmed banger, ship?" not "maybe look at this." OAuth = $0 marginal, so spending cheap quota to save user attention is the right trade. |
| **Ship gate** | Confirm-then-ship on user's tap (option A) | Public voice + money-adjacent reputation = "anything you care about" → human gates it. But effort is one Discord reply because scout already did the digging + pipeline self-verifies. |
| **Approval handshake** | Reply to Claude_Dev | No reaction-listener exists; Claude_Dev already handles `decode <target>`. Scout posts candidate → user replies `@Claude_Dev decode @X` → reuses existing trigger, zero new approval code. |
| **Data sources** | ChainWard's own infra | Tier 1 (free): own DB for detection. Tier 2 (cheap): cw-sentinel node for live-chain pre-verify. No external dependencies. |
| **Cadence** | Weekly | Matches the P2 goal ("1/week"); daily would re-surface the same agents and waste quota. |

## Architecture

```
weekly cron (Curator pattern: K3s CronJob OR sg-scribe systemd timer — see Open Questions)
  │
  ├─ STAGE 1 — DETECT  [FREE: pure SQL/HTTP, zero Claude, zero chain calls]
  │    • Pull ranked agents from ObservatoryService.getLeaderboard()
  │    • Join acpData (total_agdp, total_revenue, twitter_handle, name) +
  │      daily_agent_health (score) + holder/supply where available
  │    • Compute candidate signals:
  │        anomaly = max(
  │          agdp_revenue_ratio,         # Wasabot pattern: high aGDP, ~0 revenue
  │          claimed_vs_onchain_supply,  # AIXBT pattern (where supply data exists)
  │          dormant_but_hyped,          # low health score + high holder/follower count
  │        )
  │        reach   = f(holder_count, twitter_followers if available, total_unique_wallets)
  │        juice   = anomaly * reach     # the ranking key
  │    • Dedup against state file: skip agents decoded already (deliverables/ dir)
  │      OR surfaced in the last N weeks (scout-state.json)
  │    • Pick TOP 1 candidate
  │
  ├─ STAGE 2 — PRE-VERIFY  [~1 Claude session/week; confirms it's real]
  │    • One `claude --print` session, top-1 candidate ONLY
  │    • Confirms the anomaly against cw-sentinel (live Base chain) — NOT a 3rd-party API
  │    • Output: { confirmed: bool, proof: "2-sentence screenshotable claim",
  │               screenshot_hint, reach_summary }
  │    • If NOT confirmed → record in state, exit quietly (no ping). Optionally try #2 next.
  │
  ├─ STAGE 3 — PING  [Discord post to a channel Claude_Dev watches]
  │    "🔭 Decode candidate: <name> (@handle)
  │     Anomaly: <proof — e.g. '$81M aGDP claimed, $5.9k actual revenue on-chain'>
  │     Reach: <e.g. '412k token holders'>
  │     Ship it?  →  reply:  @Claude_Dev decode @<handle>"
  │
  └─ (record candidate in scout-state.json regardless, for dedup)

  ── USER (async, one reply) ──
  user replies in Discord:  @Claude_Dev decode @<handle>
  │
  └─ Claude_Dev (existing) → spawns Auto-Decode Pipeline (UNCHANGED)
        → research fan-out → write → verify gauntlet → publish article + tweet
```

## Components

| Component | What | Where |
|---|---|---|
| **Detector** | Pure-code anomaly×reach scan over ChainWard DB. No LLM. | New: `scripts/decode-scout/detect.ts` (in chainward repo — it needs DB + observatory access) |
| **Pre-verifier** | One `claude --print` confirming top candidate vs cw-sentinel | New: `scripts/decode-scout/prompts/pre-verify.md` + entrypoint glue |
| **Entrypoint** | Orchestrates detect → pre-verify → ping; writes state | New: `scripts/decode-scout/index.ts` (`pnpm scout:run`) |
| **State** | Dedup + budget tracking | New: `scripts/decode-scout/scout-state.json` (gitignored or a small DB table) |
| **Schedule** | Weekly trigger | Curator-pattern cron (K3s or sg-scribe — Open Q) |
| **Ship trigger** | UNCHANGED — existing `decode <target>` via Claude_Dev | Reuses [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) |

The scout is a **thin orchestration layer** over machinery that already exists (observatory data, cw-sentinel, Auto-Decode). Detection logic + a Discord post + state are the only net-new code.

## Token / quota budget (load-bearing — user-requested gate)

Everything shares ONE Claude subscription quota with: 4 existing cron agents (curator, drift-checker, fleet-monitor, crypto-recon/analyzer), always-on Claude_Dev triage, per-decode pipeline bursts (~8–12 sessions each), and interactive sessions. Anthropic exposes **no API to query remaining quota**, so the gate is **structural, not reactive**:

1. **Detection burns ZERO Claude** — pure SQL/HTTP. Can run as often as wanted for free.
2. **Pre-verify is capped at 1 Claude session/run, top-1 candidate only.**
3. **Weekly cadence** → scout costs **≤ ~4 Claude sessions/month**. Negligible.
4. **The big spend (decode pipeline, 8–12 sessions) only fires on the user's tap** — the user IS the quota gate on the expensive burst. Scout can NEVER autonomously trigger a decode.
5. **Stagger + cooldown** — run at a slot nothing else uses (existing crons cluster 04:00–05:00 + 10:00; scout at e.g. Mon 08:00). Dedup prevents re-pinging the same agent within N weeks.
6. **Kill switch** — it's a cron with a `suspend` flag; if quota is ever tight, pause the scout and the other agents keep running.

**Predictable monthly ceiling:** scout ≤ 4 sessions/mo (scheduled) + decodes ≤ 4/mo *at user discretion* (≈ 32–48 sessions, but gated by the user's taps). The only uncapped-by-code spend is decodes — and that's deliberately behind a human.

## Error handling

- **No candidate clears threshold** → exit quietly, no ping (silence is correct; pull-shaped).
- **Pre-verify fails to confirm** → record in state, no ping. (Anomaly was a data artifact, not real.)
- **cw-sentinel unreachable** (it gets paused for RAM upgrades — see acp-decoder config) → fall back to `mainnet.base.org` like the decoder does, OR skip pre-verify this run and ping with a "UNVERIFIED — sentinel down" caveat. (Open Q: which.)
- **Claude pre-verify errors / times out** → exit non-fatally, log, no ping. Never spam on failure.
- **Detector DB error** → exit, log to Discord ops channel (not the candidate channel).

## Testing

- **Detector: unit-tested deterministically.** Feed fixture rows (a Wasabot-shaped anomaly, an AIXBT-shaped one, a boring agent) → assert ranking + threshold + dedup. This is the core logic and it's pure → fully testable, no LLM. (Mirror the existing `scripts/auto-decode/lib/__tests__/` pattern, 23 tests.)
- **Pre-verify prompt:** smoke-test against one known agent (Wasabot/AIXBT) in DRY mode — does it produce a confirm + a real screenshotable proof?
- **End-to-end dry run:** scout run that posts to a TEST Discord channel, no real ping, confirm the message format + that replying `decode @X` to Claude_Dev still works (it's the unchanged path).

## Why this fits the "cracked operator" thesis

It's pull-shaped (no added notification load), weaponizes machinery already built (Auto-Decode, observatory, cw-sentinel), executes the written P2 strategy on autopilot, costs ~nothing in quota, and keeps the human as the one-tap gate on the only expensive + reputation-bearing step. Detection (the new value) is free and runs on ChainWard's own data + node.

## Resolved decisions (user approved 2026-06-04 — "your call on all")

1. **Host → K3s CronJob in the `chainward` namespace** (Curator pattern). Direct in-cluster access to ChainWard's Postgres + observatory API; Phoenix-traceable; inherits the fleet's reliability conventions (`pullPolicy: Always`, OTel telemetry block, GHCR Actions-access). The scout does NOT run the pipeline — it only reads data + posts to Discord — so it needs nothing sg-scribe-local. Ship trigger stays on sg-scribe via Claude_Dev (unchanged).
2. **cw-sentinel down → fall back to public `https://mainnet.base.org`** (same as the decoder's `sentinelRpc` default) and stamp the proof line with which RPC was used (`source: cw-sentinel` | `source: public-rpc`). No skip — same chain, scout stays alive during sentinel maintenance.
3. **Dedup → decoded = permanent skip; surfaced-but-not-shipped = 4-week cooldown.** Decoded detection = presence of `deliverables/<slug>/`. Surfaced candidates tracked in `scout-state.json` with a `surfaced_at` timestamp.
4. **Thresholds → ship with aGDP/revenue-gap + dormant-but-hyped** (both computable from data we have today: `acpData.totalAgdp/totalRevenue`, `dailyAgentHealth.score`, holder/wallet counts). Supply-mismatch (AIXBT pattern) is a documented FUTURE signal — added once supply data is reliably populated; NOT a blocker for v1.
5. **Channel → dedicated `#decode-scout` webhook** via `SCOUT_DISCORD_WEBHOOK` env var; falls back to the daily-ops webhook if unset. **User setup step:** create the Discord channel + webhook and add `SCOUT_DISCORD_WEBHOOK` to the scout's secret (can't be automated — Discord webhooks are created in the Discord UI). Not a build blocker.

### Approval-handshake clarification (no new code)
Claude_Dev's primary surface is DM + #alerts-with-@mention; it already handles `decode @<handle>`. The scout's ping includes the **exact ready-to-send command** (`decode @<handle>`). User approves by sending that command to Claude_Dev (DM or @mention) — which is the existing, unchanged trigger. The scout needs ZERO Claude_Dev modifications and no reaction-listener.

## Related

- [Auto-Decode Pipeline](http://docs.k3s.nox/books/automation-integration/page/auto-decode-pipeline) — the unchanged ship path this triggers
- [GTM TODOs — Distribution Plays](http://docs.k3s.nox/books/automation-integration/page/gtm-todos-distribution-plays) — P2 ("decode cadence as a media business") this automates
- [BookStack Curator](http://docs.k3s.nox/books/automation-integration/page/bookstack-curator) — host pattern reference
- [On-Chain Decode Runbook](http://docs.k3s.nox/books/chainward/page/on-chain-decode-runbook) — investigation methodology (BookStack 172)
