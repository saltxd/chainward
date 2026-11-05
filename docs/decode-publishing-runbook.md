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

## Auto-decode pipeline (draft generator)

As of 2026-04-28 (first ship: Axelrod), the decode pipeline is automated up to a draft. Since 2026-11-05 it publishes nothing by itself (security audit, B-U07-1). Trigger via:

- **Discord DM** to Claude_Dev: `decode @<name>` or `decode 0x<address>`
- **Direct CLI** on <ops-host>: `pnpm decode:auto @<name>`
- **From any Claude with homelab MCP**: `ssh <ops-host> '~/Forge/chainward && pnpm decode:auto @<name>'`

The pipeline researches, writes and runs a 3-verifier gauntlet. When the run reports `ready`, the launcher (not the model) checks the files, pre-renders the OG card and commits the draft **locally** on the ops checkout as `feat: add decode <slug>`. It never pushes, deploys or tweets. End-to-end ~20-30 min, plus the chain-facts read (see "Chain facts" below), which can take up to 45 min for a busy wallet.

**Discord output:** every run posts its `<DISCORD_SUMMARY>` block plus a `launcher:` line to the dedicated webhook channel. `result` is `ready`, `halt-chain-facts` (the head block could not be read, so nothing started), `halt-research-failed`, `halt-writer-failed`, `halt-verifier-failed` or `halt-verification`. After a `ready`, the `launcher:` line says `committed <sha> ...`, or `halt-output-invalid` (a file that is not one of the nine pipeline files, a front matter slug that is not the run's, not five tweets, or verifier failures left), `halt-og-render` or `halt-commit`, with the reason. After every run, whatever its result, the launcher deletes anything in `deliverables/<slug>/` that is not a pipeline file and names it in the `launcher:` line (`removed files the run was not allowed to leave: ...`); such a run commits nothing. A run that dies without a summary posts `result: crashed`.

**Exit codes:** 2 usage, 3 slug collision, 4 claude CLI not runnable, 5 the registry name or wallet address is outside the strict shape (see "Locked-down runs"), 6 the run guard hook failed its self-test, 7 the chain facts could not be read (the head block), otherwise claude's own.

**On halt:** read the verification reports in `deliverables/<slug>/`, decide whether to:
- Re-launch (if it was a transient, e.g. a public RPC was rate-limiting; check `unavailable` in the facts note of the run's log)
- Fix the prompt (if a verifier produced false positives or false negatives)
- Hand-finish the decode using the manual flow below (the artifacts are still useful)

**Publishing a ready draft** is manual: review `deliverables/<slug>/`, run "Checking a decode before it ships" below, regenerate and commit the decode manifest (`node scripts/build-decode-manifest.mjs`), push to `main` (that is the deploy), confirm the page is live, then post tweet 1 of `tweet.md` with the decode URL on its own line: `gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text=<copy>`.

The full pipeline spec lives in the internal wiki (BookStack page 199), not this repo.

### Locked-down runs (since 2026-11-05)

Both Claude runs that read outside text start Claude the same way (`scripts/auto-decode/lib/claude-run.ts`): this pipeline and the paid-brief poller (`scripts/fulfill-briefs.ts`, prompt `scripts/auto-decode-prompts/brief.md`). Security audit 2026-11-05, F-001 and B-U07-1.

- No `--dangerously-skip-permissions`. `--permission-mode dontAsk`: anything not allow-listed is refused, never asked.
- A fixed tool set, never a shell. The brief gets **no tools at all** (`--tools ""`, no allow rules): its chain facts are in its prompt. The decode gets Read, Glob, Grep, Write, Edit, WebFetch and Task (subagents).
- The decode's WebFetch reaches only `base.blockscout.com`, `acpx.virtuals.io`, `api.virtuals.io` and `api.dexscreener.com` (Blockscout answers 403 from the ops host, so the prompts send chain questions to the facts file instead and the verifiers re-fetch only ACP, Virtuals and DexScreener). The allow rules pre-approve those four; a PreToolUse hook (`scripts/auto-decode/hooks/run-guard.mjs`, passed with `--settings`) refuses every other host, including the documentation sites Claude Code otherwise fetches without asking. Hyperliquid and other chains are out of reach, so cross-venue claims stay "unverified inference".
- The same hook refuses any subagent started with `isolation`: a `remote` subagent is a cloud session that this lockdown would not bind, and `worktree` is not needed. The hook is set to `onFailure: "block"`: if it cannot start, crashes or times out, the call is refused rather than run. Both launchers also run its self-test before every run, so a broken hook stops a run before it starts (`decode:auto` exits 6; the brief poller exits before claiming an order).
- The decode reads only `deliverables/<slug>/`, `scripts/auto-decode-prompts/`, `deliverables/aixbt/` and its facts folder (`facts/facts.json` in the run's temp dir, read-only). It may write only the nine pipeline files there, one rule per name (`identity-chain.md`, `token-economics.md`, `utility-audit.md`, `decode.md`, `tweet.md`, `writer-retry-brief.md` and the three `verification-*.md`). That refuses a `CLAUDE.md`, `AGENTS.md` or `.claude/` in the folder itself, but a rule for a file name also covers paths under a folder of that name (`decode.md/CLAUDE.md` was written in review). The launcher's sweep after every run removes any such leftover; it cannot run if the launcher is killed mid-run (Ctrl-C, a dropped ssh session, a reboot), so after an interrupted run check the folder holds nothing but those nine files before any Claude session opens it. The brief runs in an empty directory.
- No MCP server (`--strict-mcp-config`; `scripts/auto-decode.mcp.json` is gone): no homelab tools, no BookStack, no ssh to the sentinel node.
- A fresh, empty `CLAUDE_CONFIG_DIR` per run and `--setting-sources user`: nothing from the ops host's `~/.claude` (settings and their allow rules, CLAUDE.md, memory, skills, hooks).
- An environment built from an allow-list: PATH, HOME, locale and TLS/proxy plumbing plus the run's `CLAUDE_CODE_OAUTH_TOKEN`. No GitHub token, ops key or webhook.

Outside text reaches the model only as JSON in a block the prompt calls untrusted data: `<untrusted_registry_data>` (decode: the agent's display name and wallet), `<untrusted_order_data>` (brief: target, contact, delivery) and `<untrusted_chain_facts>` (brief: the chain facts pack; the decode gets the same pack as a file). Inside the pack, token names, ACP descriptions and ChainWard labels are cut to 64 characters and stripped of line breaks. An ACP registry name must be letters, digits, space, `.`, `_` or `-`, 1-40 characters, with no instruction-like words, or the run is refused. A brief target must be a Base address or an agent handle and a contact an email address or a handle in its platform's shape; the API checks both when the order is created and the poller checks them again before each run (an order that fails is marked failed, not decoded). A public brief thread must open by tagging the buyer; that is the only `@` it may carry in any form (no `.@name`, no fullwidth at-sign, no email), and the only link or domain name it may carry is exactly chainward.ai (no subdomain, no look-alike such as `chainward.ai.xn--80aswg`). Links are found with twitter-text, X's own parser (pinned at 3.1.0, Apache-2.0), which also links bare domains under punycode TLDs, plus a wider net for TLDs newer than its 2020 list. Otherwise the order fails instead of posting.

The flags were checked against Claude Code 2.1.318. An older CLI that lacks one exits with "unknown option", so update `claude` on the ops host if runs start failing that way. Settings that fail validation are dropped silently in print mode, so after every Claude Code upgrade on the ops host run the live checks, which need a Claude login: `CW_LIVE_CLAUDE=1 pnpm --filter @chainward/auto-decode test -- live-guard` (the decode run's arguments: it must show a documentation host refused, a listed API allowed, and a broken hook blocking every call) and `... -- live-injection` (a real brief run on a pack whose token name is an attack: no tool call, and neither the link nor the address it asked for in the answer).

### Chain facts (since 2026-11-05)

`scripts/auto-decode/lib/chain-facts.ts` is trusted launcher code that reads the chain and hands the run a pack of facts, because Blockscout is unreachable from the ops host and the brief run has no tools. The pack is JSON: `as_of` (head block and its age when read, and the `state_block` every balance and count is read at), `facts[]` (each with an id `F1`.., a label, a value, a BaseScan `source` and how to `cite` it), `unavailable[]` and `limits[]`.

- **What it holds:** account type (EOA, EIP-7702 delegation, contract; EIP-1967 proxy implementation and admin, minimal clone, Safe owners and threshold, ERC-4337 user operation count, ERC-20 name, symbol, decimals, supply and `owner()`), nonce, ETH, USDC and USDT balances, a Transfer-log scan (counts, USDC and USDT sums, top counterparties, the 10 largest moves with hashes, and the window actually covered), ChainWard's public reads (lookup, economics, decodes, cached risk report and attestation), DexScreener pairs for a token, and for a decode up to 12 sample receipts.
- **Where it reads, and only there:** `base-rpc.publicnode.com` (state reads and address-filtered logs), `base.gateway.tenderly.co` (wallet-wide Transfer logs: publicnode refuses `eth_getLogs` with no address, and Tenderly's keyless limit is 1000 blocks a call, both measured 2026-11-05), `mainnet.base.org` (receipts, head fallback), and GETs to `api.chainward.ai`, `acpx.virtuals.io` and `api.dexscreener.com`. Each RPC host gets at most 2 requests a second. The file reads no environment: it never touches `alchemy.com`, `riskChainRpcs()`, `SENTINEL_RPC` or `ALCHEMY_API_KEY`, and nothing it does POSTs to ChainWard (a `POST /api/risk/check` would publish a public report on a private buyer's target).
- **A failed read is `unavailable`, never zero.** A 429 gets one retry, then the fact is absent and the reason is listed. The brief says so in the section it belongs to. If the head block cannot be read at all the order fails (brief) or the run does not start (decode, exit 7).
- **The window:** the brief scans up to 14 days within a 10-minute budget, the decode 30 days within 45 minutes (about a day of history costs a minute at the pacing above). When the budget runs out the scan stops and the pack states the days it actually covered. The audit is limited to that window and the brief and the decode say so; lifetime counts, first activity, holders, top-10 share, the deployer of a non-token contract and verified source are not in the pack, so they are "not verified".
- **The brief is checked against the pack** (`checkBriefGrounding`): every 0x address or hash must be the order's target or appear in the pack (shortened forms `0x1234…cdef` must match one), links may go only to `basescan.org`, `base.blockscout.com`, `dexscreener.com`, `chainward.ai` and `app.virtuals.io`, and the only `@` allowed is the buyer's. A brief that fails is not delivered; the order is marked failed.
- **Grounding reads what the reader sees.** Only addresses and hashes from the chain's own facts count as known (never token names, ACP descriptions or ChainWard text; hex of 6 or more characters inside those is replaced with `0x…(redacted)` before the pack is built). The brief is normalised (NFKC, zero-width and bidi characters dropped, backslash escapes and `[.]` undone) and then checked case-insensitively, with or without `0x`. Raw HTML, HTML entities and images in a brief are refused outright. The buyer's contact is never cut out of the text; only an email contact's exact address is set aside in the link check.
- **Gaps and age:** a scan range that fails is not counted: coverage is the unbroken run of answered ranges from the head, the failed range is listed as `transfer_scan_gap`, and transfers outside the stated window are dropped. A head older than 120 s is refused (the other node is tried, then the order fails).
- **One poller at a time:** `fulfill-briefs.ts` takes a pid lock file (`$TMPDIR/cw-fulfill-briefs.lock`, or `BRIEF_LOCK_FILE`); an overlapping cron run logs and exits.
- **Optional, off:** `CW_READ_API_KEY` in the poller's environment adds `GET /v1/wallet/<address>` (first-seen date, first funder; one of the account's 1,000 monthly lookups per brief). It goes only to `api.chainward.ai` and never into a Claude run.
- **Live data test:** `CW_LIVE_RPC=1 pnpm --filter @chainward/auto-decode test -- chain-facts` builds a real one-day pack and prints its `unavailable[]` and the `eth_getLogs` spans it used. It needs no login and is skipped in CI; run it sparingly.

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
- `pnpm decode:auto @<name>` (`scripts/auto-decode/index.ts`) — decode pipeline up to a locally committed draft; never publishes
- `pnpm decode:og-render <slug>` (`scripts/auto-decode/og-render.ts`) — pre-render OG card locally (the auto-decode launcher runs it after a `ready` run)
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
1. **Sentinel freshness preflight** — research prompts said "sentinel preferred" with no head-age check; during an EL-sync catch-up the node answers RPC with a days-old head, so current-state reads (balanceOf etc.) would ship as "current". All three research prompts now run a mandatory preflight: stale head → sentinel only for immutable historical facts, current-state from Blockscout/public RPC, per-fact provenance. (Bonus finding: pruning ALSO nulls receipts for history older than ~30d — the preflight note covers both.) Superseded 2026-11-05: the runs no longer reach the sentinel at all; research reads Blockscout through WebFetch, and the per-fact source-and-block rule stays.
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
Or DM Claude_Dev: `decode @<name>`. The env file needs only `CLAUDE_CODE_OAUTH_TOKEN` and `DISCORD_WEBHOOK_URL` (see `scripts/auto-decode/.env.example`); the pipeline no longer uses a GitHub token or `DRY_RUN`. The pipeline handles its three review checkpoints algorithmically; if it halts, fall back to the manual flow. A `ready` draft is committed locally only, and still goes through "Checking a decode before it ships" above before anyone publishes it.

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
