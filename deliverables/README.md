# Decodes — Publishing Checklist

On-chain investigation articles. Each subdirectory holds one decode + supporting
artifacts. The web app auto-discovers `<dir>/decode.md` (or the alphabetically
first non-skipped `.md` file — see `apps/web/src/lib/decodes.ts`).

Live URL pattern: `chainward.ai/decodes/<frontmatter.slug>`.

The full investigation methodology and voice guide lives in **BookStack page 172
(On-Chain Decode Runbook)**. This README is the practical "ready to ship"
checklist — what files need to exist before you push the launch tweet.

---

## New decode checklist

For each new decode, in order:

1. **Pick a final slug.** Once X scrapes a URL, it caches the result for ~7 days
   keyed on the canonical URL. If you launch with a slug, then rename, X keeps
   the old "no image" / wrong card cached against the old URL until it expires.
   Hyphenated lowercase, descriptive, never just the agent name (we burned
   through `aixbt` → `aixbt-decode` → `aixbt-on-chain` learning this).

2. **Write `decode.md`** with frontmatter:

   ```markdown
   ---
   title: "Agent X On-Chain Decode"
   subtitle: "<one-line hook, ≤140 chars — ends up in og:description>"
   date: "YYYY-MM-DD"
   slug: "agent-x-on-chain"
   ---

   # Agent X On-Chain Decode
   ...
   ```

3. **Drop a static OG image** at `apps/web/public/decodes/<slug>/og.png`
   (1200×675 PNG, ≤5MB). The page metadata helper at
   `apps/web/src/app/decodes/[slug]/page.tsx` (`resolveOgImageUrl`) prefers
   static when present.

   **Why static:** the dynamic `@vercel/og` Edge route at
   `/api/decodes/[slug]/og` works in browsers, Discord, iMessage, etc., but X's
   scraper choked on it inconsistently (200 + valid PNG response, X still
   showed "no image" placeholder). Static asset = same delivery path as
   `/chainward-og.png` which X scrapes reliably.

   To generate the OG file, easiest path is: deploy the decode first (dynamic
   route picks it up automatically), then `curl -o og.png
   https://chainward.ai/api/decodes/<slug>/og`, save to public/, commit,
   redeploy. Two deploys but no special tooling needed. **Make sure to do this
   *before* the launch tweet.**

4. **Embed any chart(s)** as static assets too:
   `apps/web/public/decodes/<slug>/<chart>.png`. Reference from `decode.md`
   with absolute path: `![alt](/decodes/<slug>/chart.png?v=1)`. Bump the `?v=N`
   query whenever you re-render the chart — Cloudflare keys cache on full URL
   (see Cloudflare gotcha section below).

5. **Deploy + verify** before tweeting:
   - `chainward.ai/decodes/<slug>` returns 200
   - `chainward.ai/decodes/<slug>/og.png` returns 200 image/png
   - View source: `<meta property="og:image">` points at the static URL, not
     `/api/...`

6. **Then** post the launch tweet (manually or via `chainward-bot`'s
   `text` workflow input).

---

## Cloudflare cache gotchas

Static assets in `apps/web/public/` are served via Cloudflare with long
caching. Keyed on **full URL including query string**.

When you update an in-place asset (e.g. fixing a chart layout) and redeploy,
the new file lands at origin but Cloudflare keeps serving the cached old one
on the bare URL. Symptom: `curl -sI <url>` returns the old `content-length`
despite a clean rollout, while `curl '<url>?bust=1'` returns the new size with
`cf-cache-status: MISS`.

**Fix: bump a `?v=N` query in the consuming reference.**

```diff
- ![alt](/decodes/aixbt-on-chain/chart.png)
+ ![alt](/decodes/aixbt-on-chain/chart.png?v=2)
```

Cloudflare keys cache on the full URL — `?v=2` is a URL it has never seen, so
it fetches fresh from origin. Bump the integer whenever you update the asset.

If the Cloudflare API token ever gets wired into the deploy script, the
alternative is a programmatic purge — but until then, query-string bump is the
zero-config workaround.

---

## X / Twitter caveats (the hard-learned ones)

- X normalizes URLs by the **canonical URL** (`og:url` meta tag), not by query
  string. `?ref=launch` does not bust X's cache.
- X caches scrape results for ~7 days. There is no public flush mechanism.
- The dynamic `@vercel/og` route serves valid PNGs but X's scraper sometimes
  silently fails on it. **Always pre-render OG to a static asset** before the
  launch tweet. Don't trust the dynamic route for X-facing OG.
- New X accounts may get card previews suppressed for spam reasons; verified +
  Premium accounts (like `@chainwardai`) have not exhibited this in practice.
- If X *did* cache "no image" for a URL: rename the slug to something fresh,
  add a 308 redirect from old → new in `apps/web/next.config.ts`, redeploy,
  re-tweet.

---

## File layout reference

```
deliverables/<dir>/
├── decode.md          ← published article (frontmatter + body)
├── thread.md          ← tweet thread version (optional, ignored by web)
├── findings.md        ← raw research notes (ignored by web)
├── publish-checklist.md ← per-decode checklist (ignored by web)
└── <other-research>.md  ← supporting analysis (ignored by web only if it
                          sorts after decode.md alphabetically; otherwise
                          add to SKIP set in apps/web/src/lib/decodes.ts)

apps/web/public/decodes/<slug>/
├── og.png             ← 1200×675 OG card (static, used by X)
└── <chart>.png        ← any inline charts referenced from decode.md
```

The `apps/web/src/lib/decodes.ts` loader picks the alphabetically first `.md`
in the deliverables dir that isn't in `SKIP = {publish-checklist.md, thread.md,
findings.md}`. Naming the canonical file `decode.md` ensures it sorts first.
