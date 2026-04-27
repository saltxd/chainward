# Mobile Optimization — Public Pages

**Date:** 2026-04-27
**Author:** Claude (with mburkholz)
**Status:** Approved

## Problem

The site doesn't render well on iPhone-class viewports (375–390px). User reported issues seen across the home page, the Base Agent Observatory, the live tx feed, the 30-day charts, and the about/FAQ section. Specifically:

- `StatusTicker` wraps eight data items into a tall block at the top of every page
- `NavBar` is cramped — the `./connect →` CTA wraps awkwardly next to the nav links
- `StatTile` values use `clamp(32px, 4vw, 52px)` and look oversized on narrow screens
- `DataTable` uses fixed pixel column widths; the flex `agent` column collapses on mobile, causing wrapping and an overstuffed feel
- Section paddings and chart heights are tuned for desktop

## Scope

**In scope** — public routes only:
- `/` (landing)
- `/base` (observatory)
- `/base/[slug]` (agent detail)
- `/decodes`, `/decodes/[slug]`
- `/wallet`, `/wallet/[address]`
- `/docs`, `/docs/cli`, `/docs/alerts`, `/docs/api`
- `/(auth)/login`, `/(auth)/register`

**Out of scope:**
- Authenticated dashboard (`/overview`, `/agents/*`, `/alerts`, `/transactions`, `/settings`)
- Net-new components or features
- Visual redesign — desktop look stays identical

**Target viewports:** Primary 375–390px (iPhone 13/14/15). Should not horizontal-scroll the page body at 320px (iPhone SE 1st gen).

**Existing breakpoints:** 720px and 960px in `v2-tokens.css`. We will add a new ≤480px breakpoint for finer mobile control.

## Component Changes

### 1. `StatusTicker` (apps/web/src/components/v2/StatusTicker.tsx + v2-tokens.css)

At ≤480px:
- Show only `base.tip`, `rpc`, `indexer` (the live status signals that are unique to this bar)
- Hide `sentinel.tip`, `fleet.size`, `tx.7d`, `tvl.watched`, `utc` — these are either duplicated in the observatory body (fleet/tx/tvl) or low-signal on mobile (utc, sentinel.tip)
- Switch the row from `flex-wrap: wrap` to `flex-wrap: nowrap; overflow-x: auto` with `scroll-snap-type: x mandatory` and `scroll-snap-align: start` on items, so the bar stays a single row
- Reduce horizontal padding `8px 20px` → `6px 16px`

Implementation: CSS media query handles wrap/scroll; component itself emits all items as today and uses a CSS class (e.g. `v2-ticker-item--mobile-hide`) to hide the non-essential ones. No JS resize listener needed.

### 2. `NavBar` (apps/web/src/components/v2/NavBar.tsx + v2-tokens.css)

At ≤480px:
- Link gap `14px` → `10px`
- CTA padding `8px 18px` → `6px 12px`, font 12px → 11px
- Strip trailing ` →` from CTA label at narrow widths (use a CSS pseudo-element approach: render the arrow inside a span with class `v2-nav-cta-arrow` that hides at ≤480px). The CTA text passed in (`./connect →` or `dashboard →`) will need to either:
  - **Decision:** Move the arrow rendering into the NavBar component itself (split CTA label from arrow), so callers pass `ctaLabel="./connect"` and the arrow is rendered conditionally by CSS. This avoids parsing the label.
- Brand text font size 12px → 11px to match
- Reduce nav border-bottom padding `18px 0` → `14px 0`

### 3. `StatTile` (apps/web/src/components/v2/StatTile.tsx)

- Adjust `lg` font size from `clamp(32px, 4vw, 52px)` to `clamp(24px, 6vw, 52px)`
- Adjust `md` from `clamp(22px, 2.6vw, 34px)` to `clamp(20px, 3.5vw, 34px)`
- The `lg` size at 375px viewport: 6vw = 22.5px → clamps up to 24px floor, more proportionate than 32px

### 4. `DataTable` (apps/web/src/components/v2/DataTable.tsx + v2-tokens.css)

Add an optional `mobileCard?: boolean` prop (default `false`). When `true` and viewport ≤480px:
- Each row renders as a stacked card with label/value pairs
- Column `header` text becomes the row's inline label per cell
- Header row is hidden
- Border-bottom between rows; no internal grid

Implementation: CSS-only via media query. Each row gets `display: grid` desktop / `display: flex; flex-direction: column` on mobile when parent has `v2-tbl--mobile-card`. Each cell on mobile gets a `::before` content with the column's header text — but `::before` can't read JSX content, so instead render a `<span class="v2-tbl-cell-label">{header}</span>` inside each cell that's hidden on desktop and shown on mobile.

Update the cell render to wrap content:
```tsx
<div className="v2-tbl-cell">
  <span className="v2-tbl-cell-label">{c.header}</span>
  <span className="v2-tbl-cell-value">{c.render(row, i)}</span>
</div>
```

The label is hidden by default (desktop). On mobile when parent has `v2-tbl--mobile-card`, label is shown.

Apply `mobileCard` to:
- Observatory leaderboard table
- Observatory live tx feed table
- Agent detail page tx list (if it uses DataTable — verify)

### 5. Observatory page (`/base`) — `apps/web/src/app/base/observatory-page.tsx`

- `v2-obs-stats` — already drops to 2-col at ≤960px. Add ≤480px: gap 32px → 16px row / 20px col
- `v2-obs-tabs` — 4 tabs in one row unreadable at 375px. At ≤480px:
  - `flex-wrap: nowrap; overflow-x: auto`
  - Per-tab padding `10px 14px` → `8px 10px`, font 11px → 10px
- Charts (`v2-obs-charts > div > .v2-obs-chart-card`) — at ≤480px set chart `height={200}` (currently 240). Pass via prop or just leave 240 if not too tall — **decision: leave at 240**, the 30-day charts looked OK in screenshots
- `v2-obs-cta` — already wraps via `flex-wrap: wrap`, fine

### 6. Landing page (`/`) — `apps/web/src/app/page.tsx`

- `v2-landing-final` padding `48px` → `24px` at ≤480px
- `v2-landing-hero` already collapses to single column at 960px (good)
- Verify hero title `clamp(44px, 7vw, 88px)` — at 375px → 44px floor fits; at 320px → 44px still fits (320*0.07=22.4 → 44)
- `v2-landing-section` padding `80px 0` → `48px 0` at ≤480px (less vertical air)

### 7. Other pages

- **`/wallet`** — Read the page; if it has a center-form-with-CTA shape, ensure form fields are full-width on mobile
- **`/wallet/[address]`** — likely uses DataTable; apply `mobileCard` if so
- **`/decodes`** — list view, ensure article cards stack
- **`/decodes/[slug]`** — `decode-prose` already responsive; verify code blocks scroll
- **`/docs/*`** — mostly text; verify `pre` blocks have `overflow-x: auto` (already do per `globals.css`)
- **`/(auth)/login`, `/(auth)/register`** — verify form widths and that primary CTA is full-width on mobile

For these, the plan is **inspect first**, then make minimal targeted CSS adjustments. No structural changes.

## Files Touched (estimate)

- `apps/web/src/styles/v2-tokens.css` — new ≤480px media queries (~80 lines added)
- `apps/web/src/components/v2/StatusTicker.tsx` — add `mobile-hide` class to non-essential items
- `apps/web/src/components/v2/NavBar.tsx` — split arrow into separate span
- `apps/web/src/components/v2/StatTile.tsx` — adjust clamp values
- `apps/web/src/components/v2/DataTable.tsx` — add `mobileCard` prop, wrap cells with label spans
- `apps/web/src/app/base/observatory-page.tsx` — pass `mobileCard` to DataTables, add page-local mobile CSS
- `apps/web/src/app/page.tsx` — page-local mobile CSS for hero/final
- Other pages — CSS-only adjustments based on inspection

Pages that use DataTable get `mobileCard` added if appropriate.

## Testing

Manual verification using Chrome DevTools device toolbar:
- 375px (iPhone 13/14/15)
- 390px (iPhone Pro)
- 320px (iPhone SE 1st gen) — minimum bar, no horizontal page scroll

Per page, verify:
- No horizontal scroll on the page body (table internal scroll OK)
- All text readable without zoom
- CTAs are tappable (≥44px touch target)
- Navigation works without overlapping

## Non-Goals

- Hamburger menu / drawer navigation (current nav is short enough)
- Touch gesture support beyond defaults
- Progressive web app / install prompts
- Server-side mobile detection / RSC variations
