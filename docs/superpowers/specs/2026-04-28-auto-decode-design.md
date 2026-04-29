# Auto-Decode — End-to-End Automated Decode Pipeline

_Created 2026-04-28. Status: approved for implementation._

## Goal

Replace the three human checkpoints in the current decode pipeline (after research, after draft, before tweet) with a multi-agent verification gauntlet, so a request like `decode @AIXBT` produces a published article at `chainward.ai/decodes/<slug>` and a launch tweet from `@chainwardai` with no human intervention between trigger and ship.

The thing being protected: ChainWard's positioning is "every number was verified." The Wasabot session (April 13, 2026) showed that a single decode-agent will hallucinate (CSV padding, fee conflation, N=1 extrapolation, math errors, fabricated-looking tx hashes). v1 of this pipeline has to catch all five Wasabot failure modes algorithmically, since the explicit goal is no manual review.

## What's already in place

This is a pure additive build. Don't disturb:

- **Decode page rendering** — Next.js auto-discovers `deliverables/<slug>/decode.md` via `apps/web/src/lib/decodes.ts`.
- **Deploy** — `./deploy/deploy.sh --skip-migrate` rolls out api/web/indexer to K3s.
- **Twitter posting** — `chainward-bot` repo has the OAuth 1.0a credentials for `@chainwardai`, posts via `gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text=<copy>`.
- **Candidate ranking** — `pnpm decode:candidates --top N --json` outputs the queue.
- **Existing decode-agent** — `~/.claude/agents/decode-agent.md` + `~/.claude/skills/onchain-decode/SKILL.md` already encode the research methodology.
- **AIXBT artifact pattern** — `decode.md` + `identity-chain.md` + `token-economics.md` + `utility-audit.md` + `review-report.md` is the prior-art deliverable shape; auto-decode reuses it and adds `verification.md` + `tweet.md`.
- **OAuth + opus-4-7** — Claude_Dev's OAuth token at `~/.config/systemd/user/claude-discord.env` on sg-scribe is the same token bookstack-curator and drift-checker use. Reuse it. Zero per-token cost.

## Architecture

Same shape as bookstack-curator: a Claude Code session is the orchestrator. The system prompt defines the pipeline; Claude executes it via Task subagents and tool calls.

```
Trigger
  ├─ DM to Claude_Dev: "decode @AIXBT"
  │    Claude_Dev recognizes pattern, shells out:
  │    systemd-run --user --unit=auto-decode-<ts> ~/Forge/chainward/scripts/auto-decode.sh @AIXBT
  └─ ssh_exec from any Claude with homelab MCP:
       ssh sg-scribe '~/Forge/chainward/scripts/auto-decode.sh @AIXBT'

auto-decode.sh (entrypoint, on sg-scribe)
  1. Source CLAUDE_CODE_OAUTH_TOKEN, DISCORD_WEBHOOK_URL
  2. Resolve target (address | @AgentName) → wallet address via ACP API
  3. Pick + collision-check slug
  4. mkdir deliverables/<slug>/
  5. Invoke orchestrator session:
     claude --print "$(cat scripts/auto-decode-prompts/orchestrator.md)" \
       --model claude-opus-4-7 \
       --mcp-config scripts/auto-decode.mcp.json \
       --dangerously-skip-permissions
  6. On orchestrator exit: read DISCORD_SUMMARY block, POST to webhook

Orchestrator (Claude Code session)
  ├─ Phase 1: Research fan-out (3 parallel Task subagents)
  │    identity-chain  → identity-chain.md
  │    token-economics → token-economics.md
  │    utility-audit   → utility-audit.md
  │    (Each subagent independently enumerates from the target address.
  │     They share a wallet address but no shared findings file —
  │     matches the AIXBT prior-art pattern.)
  ├─ Phase 2: Write
  │    writer (Task subagent) → decode.md draft + tweet.md draft
  ├─ Phase 3: Verify gauntlet (3 parallel Task subagents)
  │    citation-verifier      → verification-citation.md
  │    failure-mode-verifier  → verification-failure-mode.md
  │    voice-verifier         → verification-voice.md (advisory only)
  ├─ Phase 4: Decision gate
  │    Aggregate verifier output. If any citation/failure-mode FAIL:
  │      - Classify each as `correctable` or `fundamental`
  │      - One retry: pass classified flags to writer with surgical fix instructions
  │      - Re-run all three verifiers
  │      - If retry produces ANY remaining citation or failure-mode FAIL → halt
  │        (Halt regardless of whether retry reduced failure count. We do not
  │         iterate to convergence; that is the rationalization loop.)
  │    If all PASS (or only voice soft-fails): continue
  ├─ Phase 5: Publish
  │    1. Slug check (collision against git history + redirects)
  │    2. Local Next.js pre-render of OG card → apps/web/public/decodes/<slug>/og.png
  │    3. git add + commit + push
  │    4. ./deploy/deploy.sh --skip-migrate
  │    5. gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text="<tweet>"
  └─ Phase 6: Discord summary
       Emit <DISCORD_SUMMARY>...</DISCORD_SUMMARY> with: target, slug, deploy URL, tweet URL, verification stats
```

## Components

### Entry-point script (`scripts/auto-decode.sh`)

~80 lines of bash on sg-scribe. Responsibilities:

1. Parse target argument (positional `$1`)
2. Validate target is either a `0x[a-fA-F0-9]{40}` address or a `@<name>` agent handle
3. Resolve `@<name>` to address via ACP API (`acpx.virtuals.io/api/agents`)
4. Generate canonical slug: `slugify(name) + "-on-chain"` (matches the AIXBT/wasabot/ethy convention; the publishing runbook explicitly recommends this pattern)
5. Collision check: if `deliverables/<slug>/` exists OR slug appears in `apps/web/next.config.ts` redirects → bail with `slug-collision` error
6. Source OAuth + webhook env from `~/.config/systemd/user/auto-decode.env` (separate file from claude-discord.env, but same token; lets us rotate independently)
7. `cd ~/Forge/chainward && git pull --ff-only` (cold start with current main)
8. Invoke `claude --print ...` with target + slug injected as front-of-prompt facts
9. On exit: extract DISCORD_SUMMARY block, POST to webhook, exit with same code as Claude

### Orchestrator system prompt (`scripts/auto-decode-prompts/orchestrator.md`)

A ~700-word prompt that:

- **Defines the role:** "You are the auto-decode orchestrator for ChainWard. Your job is to publish a decode of the given target with no human review."
- **States the inputs:** target address + canonical slug + deliverables dir, all injected by the entrypoint.
- **Lists the phases** in order, each with: (a) what subagents to spawn, (b) what files they write, (c) success/failure conditions before moving to next phase.
- **Loads the failure-mode catalog inline** — the five Wasabot failures (CSV padding, fee conflation, N=1 extrapolation, math reconciliation, sample bias). The verifier subagent prompts also get them; orchestrator references them so it can interpret verifier output.
- **Defines the verification policy:**
  - Verifier output is read-only. Orchestrator does NOT ask verifiers to reconsider.
  - One retry budget. Failure classes are `correctable` (writer can apply specific fix) vs `fundamental` (claim must be removed).
  - Retry passes failure list + classification to writer; writer applies surgical fixes; verifiers re-run.
  - If retry produces ANY remaining citation or failure-mode FAIL → halt, write `<DISCORD_SUMMARY>` with the verification report, exit 0. Halt regardless of whether retry reduced failure count. We do not iterate to convergence — that is the rationalization loop.
- **Defines the publish step** — slug check, local Next.js pre-render via `pnpm build && pnpm start &`, curl `localhost:3000/api/decodes/<slug>/og`, save to `apps/web/public/decodes/<slug>/og.png`, kill the local server, deploy.
- **Defines the Discord summary format** — block with: target, slug, deploy URL, tweet URL OR halt-reason, verifier pass/fail counts.
- **Loads voice context** by reading `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md` once at start (so writer + voice-verifier share the same canonical voice spec).

### Subagent prompts (`scripts/auto-decode-prompts/`)

| File | Role | Input | Output |
|---|---|---|---|
| `orchestrator.md` | Pipeline driver | Target + slug | Side effects + DISCORD_SUMMARY |
| `identity-chain.md` | Owner / multisig / EOA chain enumeration | Target address | `identity-chain.md` |
| `token-economics.md` | Token issuance / burns / holders if relevant | Target address | `token-economics.md` |
| `utility-audit.md` | What does the agent actually DO on-chain (fund flows, fee mechanics) | Target address | `utility-audit.md` |
| `writer.md` | Compose article + tweet from research artifacts | All three research artifacts | `decode.md` (frontmatter + body) + `tweet.md` (≤5 tweets) |
| `citation-verifier.md` | Re-fetch every cited tx hash and reconcile every numeric claim | `decode.md` + research artifacts | `verification-citation.md` (per-claim PASS/FAIL with classification) |
| `failure-mode-verifier.md` | Run the Wasabot checklist | `decode.md` + research artifacts | `verification-failure-mode.md` |
| `voice-verifier.md` | Score against SOLD-era voice patterns | `tweet.md` + decode.md hook/closer | `verification-voice.md` (advisory) |

Each subagent is invoked via the Task tool from the orchestrator session. No separate process / no separate OAuth / no token-cost concern.

### MCP configuration (`scripts/auto-decode.mcp.json`)

```json
{
  "mcpServers": {
    "homelab": {
      "type": "sse",
      "url": "http://localhost:8100/sse"
    }
  }
}
```

Uses sg-scribe's local homelab-mcp (the bot-backend instance with 68 tools, including `python_exec`). The K3s instance is not used here; running on sg-scribe means we get the full tool surface and direct repo access.

Tools the pipeline actually consumes:

- `ssh_exec` (cw-sentinel for RPC, sg-k3s-control for indexer DB if needed)
- `web_fetch` (ACP API, Virtuals API, Blockscout)
- `python_exec` (USDC Transfer event decoding from receipt logs)
- `bookstack_*` (load decode runbook page 172 at start; writer can save the published decode to BookStack as a record)

## Verification gauntlet

This is the load-bearing piece. Three verifiers run in parallel after writer produces a draft.

### Citation verifier

For every numeric or factual claim in `decode.md`:

1. Extract the claim and its citation. Citations may be: tx hash (e.g., `0xab...`), ACP API field (e.g., `revenue=$5,924.30`), block number, or sentinel RPC call.
2. Re-fetch the citation independently via the appropriate tool.
3. Compare. PASS if values match within tolerance (USD ≤ 1¢, USDC ≤ 0.000001, percentages ≤ 0.01%). FAIL otherwise.
4. **No citation = automatic FAIL.** Every claim must be backed.
5. Output: `verification-citation.md` with one row per claim: `claim | citation | re-fetched value | result`. Failures classified as:
   - `correctable` if the citation is real but the claim has wrong value (writer can correct to verified value)
   - `fundamental` if the citation doesn't exist / can't be fetched / contradicts the claim entirely (claim must be removed)

### Failure-mode verifier

Runs the Wasabot checklist explicitly:

| Check | What to look for | Classification on FAIL |
|---|---|---|
| CSV padding | Tables with rows that look copy-mutated (sequential hex addresses, regular hex-suffix patterns, repeated address chunks) | `fundamental` (drop unverified rows) |
| Fee conflation | Single fee figure that combines multiple USDC transfers; check by summing component cited transfers vs the claim | `correctable` if components are cited (split them); `fundamental` otherwise |
| N=1 extrapolation | Aggregate claim ("$245K invisible revenue") derived from a single tx | `fundamental` (drop the claim or reframe as "estimated from one observation") |
| Math reconciliation | All revenue/aGDP/job-count derivations must reconcile to the ACP API field within rounding error | `correctable` if components are visible (recompute); `fundamental` if components are missing |
| Sample bias | Any claim about "average" / "typical" / "rate" must cite N≥5 samples spanning amount ranges | `correctable` if samples available (request more); `fundamental` if pool is too small (drop) |

Output: `verification-failure-mode.md` with one row per check.

### Voice verifier

Soft-fail only. Reads `tweet.md` and the hook/closer from `decode.md`, scores against the SOLD-era patterns in `feedback_voice_chainward_threads.md`. Output: `verification-voice.md` with per-tweet score and suggested edits. Orchestrator surfaces voice warnings in the Discord summary but does not block on them.

### Decision gate logic

```
if any citation FAIL or any failure-mode FAIL:
  if retry_count == 0:
    classify failures into correctable / fundamental
    invoke writer with: original draft + verifier output + per-claim instructions
    increment retry_count
    re-run all three verifiers
    goto decision_gate
  else:
    halt
    write DISCORD_SUMMARY block summarizing the verification failure
    exit 0  (controlled halt, not script error)
else:
  proceed to publish
```

The orchestrator does NOT iterate beyond one retry. The reason: a verifier that fails after the orchestrator has already tried once to address its concerns is a verifier whose concerns the orchestrator can't satisfy. Continuing past that point is rationalization, which is exactly what we're trying to prevent.

## Publishing automation

Closing the gaps from `docs/decode-publishing-runbook.md`:

### Slug picker

`slugify(name) + "-on-chain"` is the v1 rule. Collision check:
1. Does `deliverables/<slug>/` exist? → bail
2. Does slug appear as source-or-destination in `apps/web/next.config.ts` redirects? → bail (X cache might still hold stale entry)
3. `git log --all --oneline -- "deliverables/<slug>"` non-empty? → bail (slug burned in history)

If any check fails, exit early with a controlled error to Discord. We do NOT auto-pick a fallback slug — the publishing runbook is explicit that slug renames cost X cache entries.

### Local OG pre-render

Eliminates the deploy-fetch-redeploy dance:

```bash
cd ~/Forge/chainward
pnpm install --frozen-lockfile  # cold-start safety
pnpm --filter @chainward/web build
pnpm --filter @chainward/web start --port 3001 &
LOCAL_PID=$!

# Wait for ready
for i in {1..30}; do
  curl -sf http://localhost:3001/decodes/$SLUG > /dev/null && break
  sleep 1
done

curl -sf "http://localhost:3001/api/decodes/$SLUG/og" \
  -H "User-Agent: Twitterbot/1.0" \
  -o "apps/web/public/decodes/$SLUG/og.png"

# Validate the PNG actually rendered (not 0 bytes, not error JSON)
file apps/web/public/decodes/$SLUG/og.png | grep -q "PNG image data" || die "OG render failed"

kill $LOCAL_PID
wait $LOCAL_PID 2>/dev/null
```

If the validate step fails, the orchestrator gets one retry (rebuild, re-render). On second failure, halt and post to Discord — broken-repo territory.

### Deploy + tweet

Standard, reusing existing tooling:

```bash
cd ~/Forge/chainward
git add deliverables/$SLUG apps/web/public/decodes/$SLUG
git commit -m "feat: add $AGENT_NAME on-chain decode"
git push origin main
./deploy/deploy.sh --skip-migrate

# Wait for chainward.ai/decodes/$SLUG to return 200 with the new content
for i in {1..60}; do
  curl -sf "https://chainward.ai/decodes/$SLUG" | grep -q "$EXPECTED_TITLE" && break
  sleep 5
done

# Post launch tweet
gh workflow run post-digest.yml \
  --repo saltxd/chainward-bot \
  -f text="$(cat deliverables/$SLUG/tweet.md)"
```

If deploy verification times out → halt, do NOT post tweet. Halted-after-deploy is a worse failure mode than "no decode shipped today" only if we then tweet about a broken page.

## Trigger surfaces

### Claude_Dev DM

Add to Claude_Dev's system prompt (file: `~/.claude/discord-system-prompt.txt` on sg-scribe):

> If a DM matches the pattern `decode <0x...>` or `decode @<name>`, do NOT investigate it yourself. Run:
> ```
> systemd-run --user --unit=auto-decode-$(date +%s) --wait=no \
>   ~/Forge/chainward/scripts/auto-decode.sh "<target>"
> ```
> Reply to the DM with: "🔬 Decode launched in unit `<unit-name>`. I'll DM the result when it ships." Then drop the conversation — the auto-decode pipeline will post its own webhook message when done.

The decode runs in its own systemd unit so it can't OOM Claude_Dev's process or block alert triage. Result posts independently via the Discord webhook (already configured in Claude_Dev's secrets, reused).

### ssh_exec from any Claude

Any Claude Code session with the homelab MCP can fire it directly:

```
ssh sg-scribe '~/Forge/chainward/scripts/auto-decode.sh @AIXBT'
```

This blocks until the pipeline completes. Useful when the user is already conversing with a Claude (this Forge session, a tmux session on a Mac, etc.) and wants to watch the output stream rather than wait for an async Discord message.

Both surfaces hit the same script. No code duplication.

## Cost / capacity model

- **Per decode:** ~8 Claude Code session-equivalents (orchestrator + 3 research + writer + 3 verifiers, with the retry case adding writer + 3 verifiers = up to 12). Each opus-4-7. Subscription-backed via OAuth.
- **Wall time:** 15-30 min per decode (research fan-out is the long pole; ACP API + Blockscout cross-checks dominate).
- **Sub. cap impact:** unknown. We assume <1 decode/day average is fine; will monitor cap usage during first 5 decodes. If cap pressure emerges, the obvious lever is moving voice-verifier to sonnet (advisory only — quality bar is lower).
- **Scaling concern:** if we ever add weekly-auto on top of DM-triggered, total decode count could rise to ~10/week. Re-evaluate before that's enabled.

## Failure modes (and how the design handles them)

| Failure | Where it happens | How handled |
|---|---|---|
| Target name unknown to ACP API | Resolution step | Bail before invoking Claude. Discord: "Target @X not found in ACP registry." |
| Slug collision | Slug picker | Bail. Discord names the conflict. |
| Sentinel down or far behind | Research phase | utility-audit (and any other agent doing RPC work) reports the gap in its artifact. Verifiers may then FAIL if claims rely on sentinel-only data. Halt is correct here. |
| Writer hallucinates a claim | Writer phase | Caught by citation-verifier or failure-mode-verifier. Retry with surgical fix; halt if retry doesn't resolve. |
| Verifier hallucinates a failure (false positive) | Verifier phase | Cost is one extra writer pass; if writer can't satisfy a phantom failure, we halt. False positives produce halts, not bad publishes. Acceptable. |
| Local OG pre-render fails | Publish phase | One retry. If still failing, halt before deploy. No partial-publish state. |
| Deploy fails | Publish phase | Halt. Tweet is NOT posted. Discord includes deploy logs reference. |
| Deploy succeeds but page fails to render | Publish phase | The wait-loop after deploy catches this. Tweet is NOT posted. |
| Tweet posts but with wrong URL/text | Publish phase | gh workflow run is the last step; if it succeeds, the tweet is live. If chainward-bot's workflow logic has a bug, the recovery is "delete tweet + re-post manually." Out of scope to mitigate further; we trust the existing chainward-bot. |

## Testing / dry-run gate

First five real decodes use `DRY_RUN=true`:

1. All phases run normally
2. **Skip the actual `git push`, `deploy.sh`, and `gh workflow run`**
3. Post the would-have-shipped tweet copy + a link to the local artifacts to a private Discord channel for inspection

This is the calibration ritual. It validates the verification gauntlet on real data before the first auto-publish. Flip live only after we've seen the pipeline correctly halt on a deliberately-broken decode (manually fed bad citations) AND correctly publish a good one.

## File layout

```
~/Forge/chainward/
├── scripts/
│   ├── auto-decode.sh                          # entrypoint
│   ├── auto-decode.mcp.json                    # MCP config for orchestrator
│   ├── auto-decode-prompts/
│   │   ├── orchestrator.md                     # pipeline driver prompt
│   │   ├── identity-chain.md
│   │   ├── token-economics.md
│   │   ├── utility-audit.md
│   │   ├── writer.md
│   │   ├── citation-verifier.md
│   │   ├── failure-mode-verifier.md
│   │   └── voice-verifier.md
│   └── decode-candidates.ts                    # already exists; orchestrator may consult it
├── deliverables/<slug>/                        # pipeline output (commits as part of decode publish)
│   ├── decode.md                               # published article (existing)
│   ├── identity-chain.md                       # research artifact (existing AIXBT pattern)
│   ├── token-economics.md                      # research artifact (existing AIXBT pattern)
│   ├── utility-audit.md                        # research artifact (existing AIXBT pattern)
│   ├── tweet.md                                # NEW: launch tweet copy
│   ├── verification-citation.md                # NEW: per-claim verification
│   ├── verification-failure-mode.md            # NEW
│   └── verification-voice.md                   # NEW (advisory)
├── apps/web/public/decodes/<slug>/og.png       # locally pre-rendered OG card
└── docs/superpowers/specs/2026-04-28-auto-decode-design.md   # this file
```

`~/.config/systemd/user/auto-decode.env` on sg-scribe:
```
CLAUDE_CODE_OAUTH_TOKEN=<reused from claude-discord.env>
DISCORD_WEBHOOK_URL=<existing Claude_Dev webhook or new dedicated channel>
GITHUB_TOKEN=<for gh workflow run on chainward-bot>
DRY_RUN=true   # flip to false after calibration
```

## Rollout

1. **Add prompts** — write all 9 prompt files in `scripts/auto-decode-prompts/`. Iterate the orchestrator prompt against a known target (Axelrod, the queued next decode).
2. **Add entrypoint script** — `scripts/auto-decode.sh`, including slug-picker + local-OG-pre-render logic.
3. **Add MCP config** — `scripts/auto-decode.mcp.json`.
4. **Add env file** — `~/.config/systemd/user/auto-decode.env` on sg-scribe.
5. **First dry-run** — Axelrod, `DRY_RUN=true`. Inspect all artifacts. Read every verification report. Confirm the verifier gauntlet would have caught the AIXBT factual error ("Ethy AI doesn't earn $190 per job") if presented.
6. **Adversarial dry-run** — manually inject a Wasabot-style failure into the writer's draft (e.g., add a fabricated tx hash). Confirm verifier flags it and pipeline halts.
7. **Live decode #1** — Axelrod with `DRY_RUN=false`. Watch.
8. **Live decodes 2-5** — pick from `decode:candidates` queue. Each one: read the verification report after, look for false negatives (things that shipped that shouldn't have). If any false negative emerges, treat as a P0 bug and patch the verifier prompt before next decode.
9. **Wire Claude_Dev DM trigger** — only after live decode 5 passes review.
10. **Update `docs/decode-publishing-runbook.md`** — document this pipeline as the new default; update the file map.

## Non-goals (v1)

- **Weekly auto-cron.** Roadmap item, but enabling it before DM-triggered usage proves the verification gauntlet is irresponsible. Add only after ≥5 manual decodes ship clean.
- **Live-tx ingestion** (BookStack page 182). Different pipeline. Not in scope here.
- **Cloudflare cache-bust automation.** Existing manual `?v=N` works; the OG pre-render solves the more urgent gotcha.
- **Multi-target batch decoding.** One target per invocation. Avoids context pollution between decodes.
- **Custom voice training.** Voice-verifier loads `feedback_voice_chainward_threads.md` directly. If voice quality is consistently flagged, the fix is editing that memory file, not a separate training pipeline.
- **Human-readable progress UI.** Discord summary on completion is the only output. No live status page, no streaming logs to a dashboard.
- **Auto-thread-reply continuation** (multi-tweet thread beyond 5). The current chainward-bot workflow accepts a single text payload; threading is a chainward-bot concern, not auto-decode's.
- **Retry budget > 1.** Deliberate. Convergence is rationalization.

## Open questions to resolve during implementation

- **OAuth token sharing semantics.** Reusing claude-discord.env vs creating auto-decode.env with the same token. The latter is safer (independent rotation) but requires copying. Decide before step 4 of rollout.
- **Discord webhook destination.** Same channel as Claude_Dev (mixed with alert triage) or new dedicated channel for decode pipeline output. Suggest dedicated channel for grep-ability, but defer to user preference.
- **`pnpm install` in cold-start.** If sg-scribe's chainward checkout hasn't been touched in a week, dependencies may be stale. The script does `git pull --ff-only` but doesn't re-install. Add `pnpm install --frozen-lockfile` if a stale-deps failure shows up in a dry-run; otherwise leave out.
- **Voice-verifier model.** Opus 4.7 is the default but voice scoring is advisory; could downgrade to sonnet if subscription cap pressure shows up. Decide after first 5 decodes inform the cap usage.
