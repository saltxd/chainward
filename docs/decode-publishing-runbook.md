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

## Current state (as of 2026-04-27)

**Shipped decodes:**
- `aixbt-on-chain` (slug burned through `aixbt` → `aixbt-decode` → `aixbt-on-chain`)
- `wasabot`
- `ethy-ai-decode`

**Bot:**
- Repo: `github.com/saltxd/chainward-bot` (private)
- Account: `@chainwardai` (verified, "Automated by @SaltCx" disclosure)
- Cron: Mondays 14:00 UTC (weekly digest)
- Manual posts via `gh workflow run post-digest.yml -f text=<...>`
- Auth: OAuth 1.0a user-context tokens, app owned by @SaltCx
- X API: Pay-Per-Use, ~$4.96 credits remaining (≈62 weeks of digests)
- Auto-recharge: **OFF** — top up via dev portal Billing → Credits before balance hits 0

**Tooling:**
- `pnpm decode:candidates` (`scripts/decode-candidates.ts`) — ranks next-decode candidates
- `pnpm decode:candidates --top 200 --json` — deeper pool, machine-readable

**Open infra todos** (none blocking):
- Cloudflare API token not wired into deploy.sh; cache busting is manual via `?v=N`
- OG pre-render is currently a manual step (deploy → curl `/api/decodes/<slug>/og` → save → redeploy). Next investment if more decodes warrant it: a `pnpm new-decode <slug>` scaffolder.

## The publishing pipeline at a glance

| Stage | Status | How |
|---|---|---|
| Research | manual + `decode-agent` | Spawn `decode-agent` subagent with the wallet/agent target |
| Markdown writing | manual | Write to `deliverables/<dir>/decode.md` with frontmatter |
| Page render | automatic | Next.js auto-discovers via `apps/web/src/lib/decodes.ts` |
| OG image | manual (static pre-render) | `apps/web/public/decodes/<slug>/og.png` (1200×675) |
| Inline charts | manual | Python matplotlib → `apps/web/public/decodes/<slug>/<chart>.png` |
| Deploy | manual | `./deploy/deploy.sh --skip-migrate` |
| Launch tweet | manual content + automated post | `gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text=<copy>` |
| Weekly digest | fully automated | Mondays 14:00 UTC, `chainward-bot` cron |

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

## Detailed checklist

Lives in `deliverables/README.md` (next to the decode files where developers will see it).

Use that as the operational checklist. This document is the bigger-picture context.

## Next decode (queued: Axelrod)

Per `pnpm decode:candidates` 2026-04-27 ranking:

```
Rank Agent       aGDP     Role     Score Rationale
  1  Axelrod    $106.9M  HYBRID    0.82  claim-vs-onchain mismatch ($106.9M aGDP, wallet $5.65)
  2  Otto AI    $17.2K   HYBRID    0.62  high audience pull (2,326 unique buyers)
  ...
```

**Why Axelrod is next:**
- Score gap (0.82 → 0.62) puts it in its own tier
- Same structural pattern as Wasabot (huge aGDP, tiny wallet) → strengthens editorial voice ("we cover both ends of the brand-vs-utility spectrum")
- Fresh angle: HYBRID swap-execution agent, will let us compare to Wasabot's leveraged-perp pattern

**Suggested workflow:**
1. Spawn `decode-agent` (Task tool) on Axelrod's wallet `0x999a1b60...` (need to confirm via ACP API)
2. Three review checkpoints with the human:
   - After research (wallet map, fund flows, ACP economics)
   - After draft markdown (full decode.md before publishing)
   - Before launch tweet (final tweet copy + verify static OG renders pre-tweet)
3. **Pre-render the static OG before the launch tweet** — this is the step we kept skipping
4. Slug suggestion: `axelrod-on-chain` (consistent with `aixbt-on-chain` pattern)

**Open question for the next session:**
The candidate-finder uses ACP API's `walletBalance` field, which reports "0" for many agents whose ACP wallets actually hold USDC (per chainward sentinel). Worth tightening: cross-reference against `chainward.ai/api/observatory/agent/<slug>` for true on-chain balance before scoring.

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
