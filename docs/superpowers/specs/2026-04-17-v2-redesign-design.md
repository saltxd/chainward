# ChainWard v2 Redesign — Design Spec

**Date:** 2026-04-17
**Author:** mburkholz (with claude)
**Status:** Approved for implementation

## Goal

Migrate the entire ChainWard web surface (apps/web) to the terminal/operator
aesthetic prototyped at `/v2`. Every public and authenticated route adopts the
same visual language: Fraunces display serif + JetBrains Mono + Instrument
Serif italic accents, phosphor-green on warm near-black, hard edges, live
telemetry as identity.

## Approach

**Page-by-page replacement at real URLs** (approach C from brainstorm).
The `/v2` route remains briefly during migration as the reference, but the
end state is:

- `/v2` is deleted
- `/` is the new landing (copied from v2)
- Every other route (`/base`, `/wallet`, `/overview`, etc.) has been reskinned
  in place using shared v2 primitives

No `/legacy` tree. No feature flags. Commit per page; deploy after each.

## Design Tokens

Canonical tokens extracted into `apps/web/src/styles/v2-tokens.css` and
referenced via `globals.css` so every page can consume without re-declaring.

```css
:root {
  /* Surfaces */
  --bg: #0a0b0a;           /* root background — warm near-black */
  --bg-1: #0f1110;         /* elevated surface (cards, nav strip) */
  --bg-2: #141714;         /* deeper elevation (hover, active) */
  --line: #1e231f;         /* 1px borders, section dividers */
  --line-2: #2a312b;       /* stronger borders, button outlines */

  /* Text */
  --fg: #e8ebe4;           /* primary */
  --fg-dim: #9ba397;       /* secondary / body */
  --muted: #585f56;        /* tertiary / labels */

  /* Brand */
  --phosphor: #3dd88d;     /* primary accent, success, live */
  --phosphor-dim: #1d6b42; /* subtle accents, hover glow */

  /* Semantic */
  --amber: #e8a033;        /* warning, syncing */
  --danger: #e66767;       /* error, reverts, down */
  --cyan: #5ec4e6;         /* info, links */

  /* Type */
  --font-mono: JetBrains Mono, ui-monospace, monospace;
  --font-display: Fraunces, Georgia, serif;
  --font-serif: Instrument Serif, Georgia, serif;
}
```

Decode-prose styles (blog/article CSS) adopt the same tokens.

## Typography System

| Use | Font | Notes |
|---|---|---|
| Hero / section headlines | Fraunces (display) | opsz 144, SOFT 30-50, WONK 0 |
| Italic accent phrases | Instrument Serif italic | "You found out at noon." moments |
| Body / UI / data / code | JetBrains Mono | Everything else, including long-form |
| Numerals | JetBrains Mono, tabular | tabular-nums everywhere for alignment |

Inter is kept loaded only to avoid breaking any third-party widgets that
require it; it is not used for new ChainWard text.

## Shared v2 Primitives

Extracted from `/v2/_components/` into `apps/web/src/components/v2/`:

- `StatusTicker` — always-top strip with base.tip / sentinel.tip / fleet / tvl / utc / sentinel status (real data via /api/telemetry + /api/observatory)
- `NavBar` — brand + horizontal links + primary CTA, with authenticated variant
- `SectionHead` — tag + display title + lede, used for every top-of-section hero
- `PageShell` — wraps children in the shared styled root (CSS tokens, scanline overlay, grain) so page files don't re-declare
- `StatTile` — giant mono numeral + label + unit (used in hero telemetry AND dashboard stats)
- `TerminalCard` — framed "terminal window" wrapper (top bar with dots + title, body area) for any content that should read as CLI output
- `DataTable` — dense matrix-style table (phosphor trigger column, mono body, hover row highlight) for alerts, transactions, leaderboards
- `Button` — three variants: `primary` (phosphor fill), `ghost` (border), `link` (inline accent); shell-style labels like `./connect`
- `Badge` — pill with label + value (framework tags, status indicators, chain)
- `CodeBlock` — inline + block code styling
- `Chart` primitives — Recharts wrappers that apply v2 color tokens and tabular-nums

These replace (or subsume) the existing `stat-card.tsx`, `skeleton.tsx`,
`error-banner.tsx`, `glass-toggle.tsx`, etc. Old components are deleted once
all consumers have migrated.

## Page Migration Order

Ordered to maximize visible progress per increment and to front-load the
shared-infra work that unblocks everything else.

### Phase 0 — Foundation
1. Extract tokens + primitives (`styles/v2-tokens.css`, `components/v2/*`)
2. Update `globals.css` (tokens, base styles, decode-prose reskin)
3. Copy `/v2` content into `/` (landing). Delete `/v2` tree.

### Phase 1 — Public marketing
4. `/base` (observatory — highest-traffic public page)
5. `/base/digest` + `/base/digest/snippets`
6. `/wallet` + `/wallet/[address]`
7. `/agent/[wallet]` (public status page)
8. `/decodes` index + `/decodes/[slug]` (reskin decode-prose)

### Phase 2 — Docs + auth
9. `/docs` + `/docs/cli` + `/docs/api` + `/docs/alerts`
10. `/login` + `/register`

### Phase 3 — Authenticated dashboard
11. Shared `(dashboard)/layout.tsx` — new sidebar + status ticker + shell
12. `/overview`
13. `/agents` index + `/agents/[id]`
14. `/transactions`
15. `/alerts`
16. `/settings`

### Phase 4 — Cleanup
17. Delete unused old components, remove `/v2` route if any shims remain
18. Sweep for `#4ade80`, `.v2-*` residuals, rogue `rounded-xl` etc.
19. Final code review

## Risk Areas

- **Login / wallet connect page** — RainbowKit brings its own modal styling.
  Custom theme via `darkTheme({ accentColor: '#3dd88d' })`, keep layout
  minimal around the connect button.
- **Charts** — Recharts components (balance, gas, volume) need color overrides
  for the new palette. Balance-chart gets current-balance summary treatment
  per earlier change; preserve that.
- **Decode prose** — long-form content needs serif headings + mono code +
  readable body. Switch body to a slightly proportional face (Instrument
  Sans) only for `.decode-prose p` if mono readability suffers.
- **Data density on dashboard** — tables of txs and alerts need to survive
  the mono-everywhere rule. Use the DataTable primitive with row hover +
  zebra striping to stay readable.
- **Onboarding banner** (`onboarding-banner.tsx`) — currently uses rounded
  cards + emoji-style icons; swap for the PageShell + SectionHead style.
- **Third-party widget CSS bleed** — RainbowKit, Recharts, potential
  dropdowns. Scope v2 root class to prevent leakage.

## Verification Strategy

After each page:
1. `pnpm --filter @chainward/web typecheck` clean
2. `pnpm --filter @chainward/web build` clean (catches eslint/runtime issues)
3. Commit with descriptive message
4. Deploy via `./deploy/deploy.sh`
5. `curl -sI <route>` returns 200
6. Spot-check the rendered HTML contains the expected v2 classnames/tokens

After all phases complete:
- Invoke `superpowers:requesting-code-review` to audit the full migration against the plan
- Manually click through every route to catch visual regressions
- Verify no `#4ade80` or legacy token references remain

## Out of Scope (explicitly)

- Backend / API changes (except the already-built `/api/telemetry`)
- Database schema migrations
- New features or copy beyond what's already written
- Mobile app
- Email templates (digest emails)
- Marketing site brand refresh (logos, OG images)

These stay as-is for this migration. Flag if encountered; don't fix inline.
