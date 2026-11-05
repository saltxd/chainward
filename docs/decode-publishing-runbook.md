# Decode Publishing Runbook

Living document. Started 2026-04-27 after the AIXBT decode launch went through
seven deploys, three slug renames, and ~3 hours of debugging X's card cache.
Read this before starting a new decode so we don't repeat that.

## Bootstrap (fresh Claude Code session)

If you're picking this up cold, read in this order:

1. This file (you're here)
2. `deliverables/README.md` — file-by-file publishing checklist
3. `BookStack page 172` (On-Chain Decode Runbook) — investigation methodology + voice guide
4. The most recent `deliverables/<agent>/decode.md` — house style example

Then run:

```bash
pnpm decode:candidates                # see ranked list of next-decode candidates
ls deliverables/                      # see what's already shipped
```

That's the entire context for picking up mid-flight.

## Auto-decode pipeline (preferred path)

As of 2026-04-28 (first ship: Axelrod), the entire decode pipeline is automated. Trigger via:

- **Discord DM** to Claude_Dev: `decode @<name>` or `decode 0x<address>`
- **Direct CLI** on <ops-host>: `pnpm decode:auto @<name>`
- **From any Claude with homelab MCP**: `ssh <ops-host> '~/Forge/chainward && pnpm decode:auto @<name>'`

The pipeline produces deliverables, runs a 3-verifier gauntlet, pre-renders OG, deploys, and posts the launch tweet. End-to-end ~20-30 min.

**Discord output:** every run posts a `<DISCORD_SUMMARY>` block to the dedicated webhook channel. `result` field tells you what happened: `ship`, `halt-research-failed`, `halt-writer-failed`, `halt-verifier-failed`, `halt-verification`, `halt-og-render`, `halt-deploy`, `halt-deploy-verify`, `halt-tweet`.

**On halt:** read the verification reports in `deliverables/<slug>/`, decide whether to:
- Re-launch (if it was a transient — e.g., sentinel was lagging)
- Fix the prompt (if a verifier produced false positives or false negatives)
- Hand-finish the decode using the manual flow below (the artifacts are still useful)

The full pipeline spec lives in the internal wiki (BookStack page 199), not this repo.

## Manual flow (fallback for halts)

## Current state (as of 2026-11-05)

**Published decodes:** 35, listed at chainward.ai/decodes. A decode is published when its `deliverables/<dir>/decode.md` is tracked and has no `draft: true`. The first slug burned three times (`aixbt` → `aixbt-decode` → `aixbt-on-chain`); see "Slug discipline" below.

**Bot (recorded 2026-04-27; check before relying on it):**
- Repo: `github.com/saltxd/chainward-bot` (private)
- Account: `@chainwardai` (verified, "Automated by @SaltCx" disclosure)
- Cron: Mondays 14:00 UTC (weekly digest)
- Manual posts via `gh workflow run post-digest.yml -f text=<...>`
- Auth: OAuth 1.0a user-context tokens, app owned by @SaltCx
- X API is Pay-Per-Use with auto-recharge **OFF**: check the credit balance in the developer portal (Billing → Credits) before a launch

**Tooling:**
- `pnpm decode:auto @<name>` (`scripts/auto-decode/index.ts`) — fully automated decode pipeline
- `pnpm decode:og-render <slug>` (`scripts/auto-decode/og-render.ts`) — pre-render OG card locally (used internally by auto-decode)
- `pnpm decode:candidates` (`scripts/decode-candidates.ts`) — ranks next-decode candidates
- `pnpm decode:candidates --top 200 --json` — deeper pool, machine-readable

**Deploys:** a push to `main` ships the page. CI builds and tests every image, its bump job updates `saltxd/homelab-k3s`, and Flux rolls the release (CLAUDE.md, "Deployment"). Never run `deploy/deploy.sh` without flags or `kubectl set image`: Flux reverts hand rollouts.

**Open infra todos** (none blocking):
- Cloudflare cache busting is manual via `?v=N`
- OG pre-render is currently a manual step (deploy → curl `/api/decodes/<slug>/og` → save → redeploy). Next investment if more decodes warrant it: a `pnpm new-decode <slug>` scaffolder.

## The publishing pipeline at a glance

| Stage | Status | How |
|---|---|---|
| Research | manual + `decode-agent` | Spawn `decode-agent` subagent with the wallet/agent target |
| Markdown writing | manual | Write to `deliverables/<dir>/decode.md` with frontmatter |
| Page render | automatic | Next.js auto-discovers via `apps/web/src/lib/decodes.ts` |
| API decode manifest | manual commit (build regenerates) | `node scripts/build-decode-manifest.mjs`, commit `apps/api/src/data/decode-manifest.json` (feeds `/api/public/decodes` + MCP; CI fails if stale) |
| OG image | manual (static pre-render) | `apps/web/public/decodes/<slug>/og.png` (1200×675) |
| Inline charts | manual | Python matplotlib → `apps/web/public/decodes/<slug>/<chart>.png` |
| Deploy | automatic | Push to `main`: CI builds every image, the bump job updates `homelab-k3s`, Flux rolls the release. Check the live web image tag, not CI |
| Launch tweet | manual content + automated post | `gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text=<copy>` |
| Weekly digest | fully automated | Mondays 14:00 UTC, `chainward-bot` cron |

## Pipeline audit 2026-07-09 (ButlerLiquid run) — fixes shipped + new gotchas

The full end-to-end run surfaced six process defects; three are FIXED in the repo, three are operational:

**Fixed in code (commits cfa3e3e, 3cd85bc):**
1. **Sentinel freshness preflight** — research prompts said "sentinel preferred" with no head-age check; during an EL-sync catch-up the node answers RPC with a days-old head, so current-state reads (balanceOf etc.) would ship as "current". All three research prompts now run a mandatory preflight: stale head → sentinel only for immutable historical facts, current-state from Blockscout/public RPC, per-fact provenance. (Bonus finding: pruning ALSO nulls receipts for history older than ~30d — the preflight note covers both.)
2. **CLI background ceiling** — `claude --print` kills the session after 600s of background tasks (utility-audit alone can exceed this). Launcher now sets `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` plus its own `AUTO_DECODE_TIMEOUT_MS` watchdog (default 90 min).
3. **Launcher resilience** — `claude` binary is preflighted before the deliverables dir is created (a missing binary used to strand an empty dir), an empty slug dir from a crashed run is reclaimable instead of a permanent "collision", and ANY run that dies without a DISCORD_SUMMARY now posts a `result: crashed` summary to Discord instead of failing silent.

**Operational gotchas:**
4. **Claude session limits can kill the run at the publish step** — everything verified, OG rendered, then "You've hit your session limit". The manual hand-finish is fast (this run: ~15 min): verify og.png is a PNG → `git add deliverables/<slug> apps/web/public/decodes/<slug>` → commit/push to `main` → wait for CI and the Flux rollout (check the live web image tag) → poll page → post tweet 1 via `gh workflow run post-digest.yml`.
5. **X 403 "You are not permitted to perform this action" = check Pay-Per-Use credits FIRST.** The April warning came true on this run: credits ran out, tweet blocked, article live (partial publish). Top up in dev portal → Billing → Credits, then re-dispatch the same workflow text.
6. **The launcher env needs `~/.local/bin` on PATH** (claude lives there on the ops host), not just the nvm node bin.

## Hard-learned gotchas (READ BEFORE TWEETING)

These will burn you the same way they burned us if you skip them.

### X / Twitter

- **X normalizes URLs by `og:url` meta tag, not query string.** `?ref=launch` doesn't bust X's cache. We tried.
- **X caches scrape results for ~7 days.** No public flush mechanism since the Card Validator was deprecated.
- **Once X caches "no image" for a URL, that URL is dead.** Rename the slug, add a 308 redirect, post fresh.
- **The dynamic `@vercel/og` route at `/api/decodes/[slug]/og` works in browsers, Discord, iMessage — but X's scraper silently fails on it.** Status, headers, and PNG bytes are identical to working static OGs (verified via curl with Twitterbot UA). We don't know why X chokes on it. **Always pre-render to a static asset before the launch tweet.**
- **Verified accounts (Premium) don't get card previews suppressed.** New free accounts may. @chainwardai is verified, so this is fine for our setup.

### Cloudflare

- Static assets in `apps/web/public/` are CF-cached, **keyed on full URL including query string**.
- When you update an asset in-place and redeploy, CF keeps serving the cached old version on the bare URL (default TTL is hours).
- **Fix: bump `?v=N` in the markdown reference.** `?v=2` is a URL CF has never seen → fresh fetch from origin.
- `curl -sI <url>` returns OLD content-length while `curl -sI '<url>?bust=1'` returns the NEW size with `cf-cache-status: MISS` → confirms cache, not deploy bug.

### Slug discipline

- Pick the final slug **before** the launch tweet. Renames after launch are *worse* than launching wrong because each old slug burns an X cache entry.
- We renamed AIXBT three times. Don't repeat.
- If you must rename, add the 308 redirect to `apps/web/next.config.ts`.

## Checking a decode before it ships

Since October 2026 every decode is checked by someone who did not write it, and the companies it names get a chance to answer:

1. **Claim ledger.** An independent verifier checks every sentence against the chain or the saved data and marks it PASS, FAIL, IMPRECISE or UNVERIFIED (`verify-<date>.md`).
2. **Fix round.** The author fixes every FAIL and IMPRECISE item, then verifies, softens or cuts every UNVERIFIED one, and logs each change (`fixes-<date>.md`).
3. **Skeptic.** A fresh reviewer who wrote none of it tries to break the piece (`skeptic-<date>.md`), followed by another fix round.
4. **Right of reply.** A company the piece names in a way it could dispute gets its paragraphs and the evidence, and time to answer, before publication.
5. **The owner's yes.** Nothing publishes without it.

Rules the checks enforce, each learned the hard way:

- Date every state claim with a block (or slot) and a UTC time.
- Identify every address the piece names, or leave it unnamed. A possessive ("X's contract") is its own claim: a router shared by many owners belongs to none of them.
- Count the unit you name. A table of wallet-contract pairs is not a count of wallets.
- On Solana, read a wallet's token accounts, not only its own transaction list: transfers into its token accounts do not appear there.
- When a number comes from our own node or an old scan, re-read a sample on a public RPC before publishing. A lagging node can answer with later state.
- Disclose any commercial contact with a company the piece covers (a listing, a pitch, a customer) where that company appears, not only in the footer.
- No "Update:" paragraphs. Get it right before it ships; later developments go in a new post.

## Detailed checklist

Lives in `deliverables/README.md` (next to the decode files where developers will see it).

Use that as the operational checklist. This document is the bigger-picture context.

## Choosing the next decode

Run `pnpm decode:candidates` (or `--top 200 --json` for a deeper, machine-readable pool). The April pick, Axelrod, was published on 2026-04-28 as `axelrod-on-chain`.

To run the automated pipeline on a target:
```bash
ssh <ops-host>
set -a; source ~/.config/systemd/user/auto-decode.env; set +a
pnpm decode:auto @<name>
```
Or DM Claude_Dev: `decode @<name>`. The pipeline handles its three review checkpoints algorithmically; if it halts, fall back to the manual flow. Its output still goes through "Checking a decode before it ships" above before anyone publishes it.

**Open question for the next session:**
The candidate-finder uses ACP API's `walletBalance`. This line used to say the field reports "0" for agents that actually hold USDC, and to cross-reference `chainward.ai/api/observatory/agent/<slug>` instead. **That was measured on 2026-10-30 and is backwards. Do not do it.**

Across the top 10 candidates the two sources disagreed 5 times, and a live `balanceOf` read on Base settled every one in ACP's favour, to the cent: Director Lucien ACP $73.60 / chain $73.60, Loky $44.23 / $44.23, ArAIstotle $3.04 / $3.04. In those three our own `balanceSeries` said $0.00, $0.00 and $19.59. So ACP's field is the accurate one and swapping to the observatory would have made the signal worse.

The real weakness is not which source to read, it is that a wallet balance is a weak basis for picking a decode target at all: a non-custodial agent and an agent that sweeps earnings to its owner both read near zero, and neither is a story. `computeScore` suppresses the signal when aGDP dwarfs revenue for that reason; see the comment there.

**Open question, not yet answered:** `balanceSeries` returned 31 straight days of $0.00 for two wallets that currently hold real USDC, and `transactions: []` for all three. That is consistent with deposits landing after the midnight snapshot, but it is also what a wallet missing from the indexer would look like, and these charts are customer-facing on the public site. Worth a proper look before trusting observatory balances in anything that ships.

## File map

| Path | Purpose |
|---|---|
| `deliverables/<agent>/decode.md` | Published decode markdown (frontmatter + body) |
| `deliverables/<agent>/{thread,findings,publish-checklist}.md` | Supporting artifacts (skipped by web loader) |
| `deliverables/README.md` | Developer-facing publishing checklist |
| `apps/web/public/decodes/<slug>/og.png` | Static OG card (X-facing) |
| `apps/web/public/decodes/<slug>/<chart>.png` | Inline charts referenced from decode.md |
| `apps/web/src/app/decodes/[slug]/page.tsx` | Decode page renderer (`resolveOgImageUrl` lives here) |
| `apps/web/src/lib/decodes.ts` | Frontmatter loader |
| `apps/web/src/app/api/decodes/[slug]/og/route.tsx` | Dynamic OG fallback (works for non-X scrapers) |
| `apps/web/next.config.ts` | Slug-rename redirects |
| `scripts/build-decode-manifest.mjs` | Regenerates the API's decode manifest (run by the api's `build`/`dev`) |
| `scripts/decode-candidates.ts` | Candidate ranking CLI |
| `chainward-bot` (separate private repo) | Tweet-posting workflow |

## Why this doc exists

The AIXBT decode burned ~3 hours of conversation context across:
- 7 deploys
- 3 slug renames (`aixbt` → `aixbt-decode` → `aixbt-on-chain`)
- 5 launch-tweet attempts
- Two reviewer subagents to fix the chart
- One reader-caught factual error ("Ethy AI doesn't earn $190 per job")

Most of that pain is now codified in `deliverables/README.md` (operational) and this file (strategic). Next decode should ship in <1 hour if we follow the checklist.

If it doesn't, the gotcha is a candidate for adding to this file.
