# Mobile Optimization (Public Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ChainWard's public-facing pages render cleanly on iPhone-class viewports (375–390px primary, 320px minimum) without changing the desktop look.

**Architecture:** CSS-first. We add a new ≤480px media-query band to `v2-tokens.css` for chrome (NavBar, StatusTicker, StatTile typography), modify `DataTable` to support an optional mobile-card mode (label/value stacked rows), and apply page-local CSS adjustments to observatory/landing/wallet/decodes/login. No JS resize listeners.

**Tech Stack:** Next.js 15 (App Router), React, Tailwind v4 (used minimally — most layout is hand-written CSS in `<style>` tags + `apps/web/src/styles/v2-tokens.css`), Recharts.

**Spec:** `docs/superpowers/specs/2026-04-27-mobile-optimization-public-pages-design.md`

---

## File Map

**Modified:**
- `apps/web/src/styles/v2-tokens.css` — new ≤480px media queries for nav, ticker, tile, table card mode
- `apps/web/src/components/v2/StatusTicker.tsx` — flag non-essential items with a CSS class
- `apps/web/src/components/v2/NavBar.tsx` — split arrow into hideable span; smaller font support
- `apps/web/src/components/v2/StatTile.tsx` — adjust `lg`/`md` clamp values
- `apps/web/src/components/v2/DataTable.tsx` — add `mobileCard?: boolean` prop, wrap cells with label spans
- `apps/web/src/app/base/observatory-page.tsx` — pass `mobileCard` to its 2 DataTables, add page-local mobile CSS for stats/tabs
- `apps/web/src/app/wallet/[address]/page.tsx` — pass `mobileCard` to its tx tables
- `apps/web/src/app/agent/[wallet]/page.tsx` — pass `mobileCard` to its tx table
- `apps/web/src/app/page.tsx` — page-local mobile CSS for hero/final/section padding
- `apps/web/src/app/_landing/alert-matrix.tsx` — pass `mobileCard` if appropriate (verify in task)

**Touched (callers updated due to NavBar API change):**
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/base/observatory-page.tsx`
- `apps/web/src/app/decodes/page.tsx`
- `apps/web/src/app/wallet/page.tsx`
- `apps/web/src/app/docs/layout.tsx` (and any other layout passing `ctaLabel` with `→`)

**No changes:**
- Auth pages (`/login`, `/register`) use `TerminalCard` + `Button` patterns; verify in a final task and only adjust if needed.
- `/decodes/[slug]` uses `decode-prose` (already responsive).
- `/docs/*` mostly text; verify `pre` overflow is fine.

---

## Task 1: Add ≤480px breakpoint scaffolding to v2-tokens.css

**Files:**
- Modify: `apps/web/src/styles/v2-tokens.css`

This task only adds the `.v2-ticker-item--mobile-hide` class definition (display: inline-flex on desktop, hidden ≤480px) and the `.v2-nav-cta-arrow` class (visible by default, hidden ≤480px). We need these classes existing before we modify the React components in tasks 2–3 so the components don't reference undefined CSS.

- [ ] **Step 1: Read current StatusTicker styles**

Read lines 432–475 of `apps/web/src/styles/v2-tokens.css` to confirm where the StatusTicker block ends.

- [ ] **Step 2: Add new mobile-only utility classes for ticker and nav**

In `apps/web/src/styles/v2-tokens.css`, after the existing `@media (max-width: 720px) { .v2-ticker-row { ... } }` block (around line 470–475), add:

```css
/* New mobile-only helpers used by NavBar + StatusTicker components.
   Defined here so the React tree references stable class names; the
   actual responsive behavior is in the ≤480px media block below. */
.v2-ticker-item--mobile-hide { /* shown by default */ }
.v2-nav-cta-arrow { /* shown by default */ }

@media (max-width: 480px) {
  .v2-ticker-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    padding: 6px 16px;
    gap: 14px;
  }
  .v2-ticker-item {
    scroll-snap-align: start;
    flex-shrink: 0;
  }
  .v2-ticker-item--mobile-hide {
    display: none;
  }

  .v2-nav {
    padding: 14px 0;
    font-size: 11px;
  }
  .v2-nav-brand {
    font-size: 11px;
  }
  .v2-nav-links {
    gap: 10px;
  }
  .v2-nav-cta {
    padding: 6px 12px;
    font-size: 11px;
  }
  .v2-nav-cta-arrow {
    display: none;
  }

  .v2-tile-value {
    /* Tighter line-height already inherited; rely on per-size font tweaks. */
  }
}
```

- [ ] **Step 3: Verify file still parses (typecheck)**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS (CSS doesn't typecheck but the build pipeline shouldn't be broken)

If you get module-resolution errors unrelated to your change, ignore — the CSS edit cannot break TS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/v2-tokens.css
git commit -m "feat(web): add ≤480px breakpoint scaffolding for mobile UX"
```

---

## Task 2: Hide non-essential items in StatusTicker on mobile

**Files:**
- Modify: `apps/web/src/components/v2/StatusTicker.tsx:107-134`

We're adding a `mobileHide?: boolean` flag to each item in the local `items` array. Items flagged as `mobileHide` get the new `v2-ticker-item--mobile-hide` class which becomes `display: none` at ≤480px (added in Task 1).

Items to keep on mobile: `base.tip`, `rpc`, `indexer`.
Items to hide on mobile: `sentinel.tip`, `fleet.size`, `tx.7d`, `tvl.watched`, `utc`.

- [ ] **Step 1: Update the `items` array shape and entries**

Replace lines 107–134 of `apps/web/src/components/v2/StatusTicker.tsx`:

```tsx
  const items: Array<{
    label: string;
    value: string;
    live?: boolean;
    color?: string;
    mobileHide?: boolean;
  }> = [
    {
      label: 'base.tip',
      value: telemetry?.baseTip ? `#${telemetry.baseTip.toLocaleString()}` : '…',
      live: true,
    },
    {
      label: 'sentinel.tip',
      value: telemetry?.sentinelTip ? `#${telemetry.sentinelTip.toLocaleString()}` : '…',
      mobileHide: true,
    },
    {
      label: 'fleet.size',
      value: observatory ? String(observatory.agentsTracked) : '…',
      mobileHide: true,
    },
    {
      label: 'tx.7d',
      value: observatory ? observatory.transactions7d.toLocaleString() : '…',
      mobileHide: true,
    },
    {
      label: 'tvl.watched',
      value: observatory ? formatUsd(observatory.totalPortfolioValue) : '…',
      mobileHide: true,
    },
    { label: 'utc', value: now || '…', mobileHide: true },
    {
      label: 'rpc',
      value: sentinelLabel,
      color: telemetry ? colorForStatus(telemetry.sentinelStatus) : undefined,
    },
    {
      label: 'indexer',
      value: indexerLabel,
      color: telemetry ? colorForStatus(telemetry.indexerStatus) : undefined,
    },
  ];
```

- [ ] **Step 2: Update the JSX render to apply the class**

Replace the existing `items.map` block (around lines 138–148 — currently:
```tsx
        {items.map((item, i) => (
          <span key={i} className="v2-ticker-item">
            ...
```
) with:

```tsx
        {items.map((item, i) => (
          <span
            key={i}
            className={`v2-ticker-item${item.mobileHide ? ' v2-ticker-item--mobile-hide' : ''}`}
          >
            <span className="v2-ticker-label">{item.label}</span>
            <span
              className="v2-ticker-value"
              style={{ color: item.color ?? 'var(--fg)' }}
            >
              {item.value}
            </span>
            {item.live && <span className="v2-ticker-pulse" aria-hidden />}
          </span>
        ))}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/v2/StatusTicker.tsx
git commit -m "feat(web): hide non-essential ticker items on mobile (≤480px)"
```

---

## Task 3: NavBar — split arrow into hideable span and update callers

**Files:**
- Modify: `apps/web/src/components/v2/NavBar.tsx`
- Modify: `apps/web/src/app/page.tsx:90-94`
- Modify: `apps/web/src/app/base/observatory-page.tsx:273`
- Modify: `apps/web/src/app/decodes/page.tsx:44`
- Modify: `apps/web/src/app/wallet/page.tsx:39`
- Inspect-and-maybe-modify: `apps/web/src/app/docs/layout.tsx` (find any NavBar usage)

The current API takes `ctaLabel` as a single string like `'./connect →'`. We're changing it: callers pass `ctaLabel="./connect"` and the NavBar component renders the arrow inside a `<span class="v2-nav-cta-arrow">→</span>` that the CSS hides on mobile.

- [ ] **Step 1: Find every NavBar caller**

Run: `grep -rn "<NavBar" apps/web/src`

You should find these callers (verify):
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/base/observatory-page.tsx`
- `apps/web/src/app/decodes/page.tsx`
- `apps/web/src/app/wallet/page.tsx`
- `apps/web/src/app/docs/layout.tsx` (if it uses NavBar)

If you find a caller in `app/docs/` or anywhere else, include it in subsequent steps.

- [ ] **Step 2: Update NavBar component**

Replace the contents of `apps/web/src/components/v2/NavBar.tsx` with:

```tsx
'use client';

import Link from 'next/link';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

interface NavBarProps {
  links?: NavLink[];
  ctaHref: string;
  /**
   * Text portion of the CTA, e.g. "./connect" or "dashboard".
   * The trailing arrow is rendered separately and hidden at ≤480px
   * via the `v2-nav-cta-arrow` class.
   */
  ctaLabel: string;
  brandHref?: string;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: '/base', label: 'observatory' },
  { href: '/decodes', label: 'decodes' },
  { href: '/wallet', label: 'lookup' },
];

export function NavBar({
  links = DEFAULT_LINKS,
  ctaHref,
  ctaLabel,
  brandHref = '/',
}: NavBarProps) {
  return (
    <nav className="v2-nav">
      <Link href={brandHref} className="v2-nav-brand">
        <span className="v2-nav-dot" aria-hidden />
        <span>
          chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span>
        </span>
      </Link>
      <div className="v2-nav-links">
        {links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-nav-link"
            >
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className="v2-nav-link">
              {l.label}
            </Link>
          ),
        )}
        <Link href={ctaHref} className="v2-nav-cta">
          <span>{ctaLabel}</span>
          <span className="v2-nav-cta-arrow" aria-hidden> →</span>
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Update each caller — strip ` →` from ctaLabel**

In `apps/web/src/app/page.tsx`, change:
```tsx
        <NavBar
          ctaHref={isAuthenticated ? '/overview' : '/login'}
          ctaLabel={isAuthenticated ? 'dashboard →' : './connect →'}
        />
```
to:
```tsx
        <NavBar
          ctaHref={isAuthenticated ? '/overview' : '/login'}
          ctaLabel={isAuthenticated ? 'dashboard' : './connect'}
        />
```

In `apps/web/src/app/base/observatory-page.tsx`, change:
```tsx
        <NavBar ctaHref="/login" ctaLabel="./connect →" />
```
to:
```tsx
        <NavBar ctaHref="/login" ctaLabel="./connect" />
```

In `apps/web/src/app/decodes/page.tsx`, same change as observatory.

In `apps/web/src/app/wallet/page.tsx`, same change.

For any other NavBar caller you found in step 1: strip the trailing ` →` (and any leading whitespace before it) from `ctaLabel`.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/v2/NavBar.tsx apps/web/src/app/page.tsx apps/web/src/app/base/observatory-page.tsx apps/web/src/app/decodes/page.tsx apps/web/src/app/wallet/page.tsx
# Plus any other callers found in step 1
git commit -m "feat(web): split NavBar CTA arrow into hideable span for mobile"
```

---

## Task 4: StatTile — adjust clamp values for mobile

**Files:**
- Modify: `apps/web/src/components/v2/StatTile.tsx:11-17`

- [ ] **Step 1: Update the font-size clamp logic**

In `apps/web/src/components/v2/StatTile.tsx`, replace the `fontSize` definition (lines 12–17):

```tsx
  const fontSize =
    size === 'lg'
      ? 'clamp(24px, 6vw, 52px)'
      : size === 'md'
        ? 'clamp(20px, 3.5vw, 34px)'
        : '20px';
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v2/StatTile.tsx
git commit -m "feat(web): tighten StatTile font clamp for mobile readability"
```

---

## Task 5: DataTable — add mobileCard prop with stacked-card rows

**Files:**
- Modify: `apps/web/src/components/v2/DataTable.tsx`
- Modify: `apps/web/src/styles/v2-tokens.css` (add mobile-card CSS rules)

The `mobileCard` prop, when true and viewport ≤480px, makes each row stack vertically with the column header rendered inline alongside each cell value.

- [ ] **Step 1: Update the DataTable component**

Replace the contents of `apps/web/src/components/v2/DataTable.tsx` with:

```tsx
'use client';

import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => ReactNode;
  accent?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T, index: number) => void;
  /**
   * When true, the table renders as stacked label/value cards at ≤480px.
   * Header row is hidden on mobile; each cell shows its column header inline.
   * Desktop layout is unchanged.
   */
  mobileCard?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  empty,
  rowHref,
  onRowClick,
  mobileCard,
}: DataTableProps<T>) {
  const grid = columns.map((c) => c.width ?? '1fr').join(' ');
  const tableClass = `v2-tbl${mobileCard ? ' v2-tbl--mobile-card' : ''}`;

  return (
    <div className={tableClass}>
      <div className="v2-tbl-header" style={{ gridTemplateColumns: grid }}>
        {columns.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? 'left' }}>
            {c.header}
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="v2-tbl-empty">{empty ?? 'No data yet.'}</div>
      )}
      {rows.map((row, i) => {
        const href = rowHref?.(row);
        const content = columns.map((c) => (
          <div
            key={c.key}
            className="v2-tbl-cell"
            style={{
              textAlign: c.align ?? 'left',
              color: c.accent ? 'var(--phosphor)' : 'var(--fg)',
            }}
          >
            <span className="v2-tbl-cell-label" aria-hidden>
              {c.header}
            </span>
            <span className="v2-tbl-cell-value">{c.render(row, i)}</span>
          </div>
        ));
        if (href) {
          return (
            <a
              key={i}
              href={href}
              className="v2-tbl-row v2-tbl-row-link"
              style={{ gridTemplateColumns: grid }}
            >
              {content}
            </a>
          );
        }
        if (onRowClick) {
          return (
            <div
              key={i}
              className="v2-tbl-row v2-tbl-row-link"
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(row, i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row, i);
                }
              }}
              style={{ gridTemplateColumns: grid }}
            >
              {content}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="v2-tbl-row"
            style={{ gridTemplateColumns: grid }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS rules for mobile-card mode**

In `apps/web/src/styles/v2-tokens.css`, locate the `.v2-tbl-empty` rule (around line 291). Immediately after it, add:

```css
/* Cell wrappers (used by both desktop and mobile-card layouts) */
.v2-tbl-cell {
  display: contents;
}
.v2-tbl-cell-label {
  display: none;
}
.v2-tbl-cell-value {
  display: contents;
}
```

Then, inside the `@media (max-width: 480px)` block already added in Task 1, append rules for the `mobile-card` layout:

```css
@media (max-width: 480px) {
  /* (existing rules from Task 1 stay above this) */

  .v2-tbl--mobile-card {
    border: 1px solid var(--line);
    background: var(--bg-1);
  }
  .v2-tbl--mobile-card .v2-tbl-header {
    display: none;
  }
  .v2-tbl--mobile-card .v2-tbl-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border-top: 1px solid var(--line);
    grid-template-columns: none !important;
  }
  .v2-tbl--mobile-card .v2-tbl-row:first-of-type {
    border-top: none;
  }
  .v2-tbl--mobile-card .v2-tbl-cell {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    text-align: left !important;
  }
  .v2-tbl--mobile-card .v2-tbl-cell-label {
    display: inline-block;
    color: var(--muted);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .v2-tbl--mobile-card .v2-tbl-cell-value {
    display: inline-block;
    text-align: right;
    min-width: 0;
    overflow-wrap: anywhere;
  }
}
```

Note: `.v2-tbl-cell { display: contents; }` outside the media query lets the existing grid layout work as if the wrapper isn't there. Inside the media query for mobile-card mode, the cell wrapper becomes a flex row.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/v2/DataTable.tsx apps/web/src/styles/v2-tokens.css
git commit -m "feat(web): add mobileCard prop to DataTable for stacked-card mobile layout"
```

---

## Task 6: Apply mobileCard to observatory tables + fix obs-stats/tabs CSS

**Files:**
- Modify: `apps/web/src/app/base/observatory-page.tsx`

The observatory page has 2 DataTables (leaderboard + live tx feed) and inline `<style>` rules for stats/tabs/charts. We add `mobileCard` to both tables and add ≤480px rules to the inline `<style>` block.

- [ ] **Step 1: Add mobileCard prop to both DataTables**

In `apps/web/src/app/base/observatory-page.tsx`:

Find the leaderboard DataTable (around line 341–345):
```tsx
            <DataTable
              columns={leaderboardColumns}
              rows={leaderboardRows}
              empty="No leaderboard data yet."
            />
```
Change to:
```tsx
            <DataTable
              columns={leaderboardColumns}
              rows={leaderboardRows}
              empty="No leaderboard data yet."
              mobileCard
            />
```

Find the live feed DataTable (around line 353–357):
```tsx
            <DataTable
              columns={feedColumns}
              rows={feed ?? []}
              empty="No recent activity."
            />
```
Change to:
```tsx
            <DataTable
              columns={feedColumns}
              rows={feed ?? []}
              empty="No recent activity."
              mobileCard
            />
```

- [ ] **Step 2: Add ≤480px rules to the inline `<style>` block**

In the same file, find the inline `<style>` block (starting around line 485). Inside that template literal, locate the existing `@media (max-width: 960px)` rule. After it, add:

```css
        @media (max-width: 480px) {
          .v2-obs-stats {
            gap: 16px 20px !important;
            padding-top: 24px !important;
          }
          .v2-obs-tabs {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
          }
          .v2-obs-tab {
            padding: 8px 12px !important;
            font-size: 10px !important;
            scroll-snap-align: start;
            flex: 0 0 auto !important;
          }
          .v2-obs-cta {
            padding: 24px !important;
            gap: 20px !important;
          }
          .v2-obs-chart-card {
            padding: 8px !important;
          }
        }
```

The `!important` declarations are necessary because the existing 960px rule sets some properties that we need to override only at the narrower breakpoint.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/base/observatory-page.tsx
git commit -m "feat(web): mobileCard tables + tightened stats/tabs/cta on observatory"
```

---

## Task 7: Apply mobileCard to wallet/[address] and agent/[wallet] tables

**Files:**
- Modify: `apps/web/src/app/wallet/[address]/page.tsx`
- Modify: `apps/web/src/app/agent/[wallet]/page.tsx`

- [ ] **Step 1: Read both files to find DataTable usages**

Run: `grep -n "<DataTable" apps/web/src/app/wallet/\[address\]/page.tsx apps/web/src/app/agent/\[wallet\]/page.tsx`

Note each line number where a `<DataTable` JSX element starts.

- [ ] **Step 2: Add `mobileCard` to every DataTable in those files**

For each DataTable JSX element you found, add the `mobileCard` prop. Example (illustrative — match the actual JSX in the file):

```tsx
            <DataTable
              columns={txColumns}
              rows={transactions}
              empty="No transactions found."
              mobileCard
            />
```

If a `<DataTable .../>` is self-closing on one line, expand it to multi-line and add `mobileCard` as the last prop before `/>`.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/wallet/\[address\]/page.tsx apps/web/src/app/agent/\[wallet\]/page.tsx
git commit -m "feat(web): mobileCard tables on wallet + agent detail pages"
```

---

## Task 8: Landing page mobile spacing

**Files:**
- Modify: `apps/web/src/app/page.tsx`

The landing page has its own `<style>` block (around lines 227–360) with multiple `@media (max-width: 960px)` rules. Add a ≤480px block.

- [ ] **Step 1: Add ≤480px rules to the inline `<style>` block**

In `apps/web/src/app/page.tsx`, find the inline `<style>` block. After the existing `@media (max-width: 960px)` rule (around line 236), add:

```css
        @media (max-width: 480px) {
          .v2-landing-hero {
            padding-top: 32px;
            padding-bottom: 24px;
            gap: 28px;
          }
          .v2-landing-section {
            padding: 48px 0;
          }
          .v2-landing-bottom {
            padding: 32px 0 56px;
          }
          .v2-landing-final {
            padding: 32px 20px;
          }
          .v2-landing-final::before {
            top: 10px;
            left: 16px;
            font-size: 10px;
          }
          .v2-landing-meta {
            gap: 14px 18px;
          }
          .v2-landing-cta {
            gap: 8px;
          }
        }
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): tighten landing page padding/gaps on ≤480px"
```

---

## Task 9: Wallet lookup, decodes index, and final CSS sanity

**Files:**
- Modify: `apps/web/src/app/wallet/page.tsx` (only if mobile issues found)
- Modify: `apps/web/src/app/decodes/page.tsx` (only if mobile issues found)
- Inspect: `apps/web/src/app/(auth)/login/page.tsx` (no expected change)
- Inspect: `apps/web/src/app/(auth)/register/page.tsx` (no expected change)

Light pass to verify these pages render OK at 375px after the chrome changes. Most should already be fine because they use the now-mobile-aware NavBar/StatusTicker.

- [ ] **Step 1: Verify wallet lookup form is full-width at narrow widths**

Read `apps/web/src/app/wallet/page.tsx`. Look at `.v2-lookup-cta` and `.v2-lookup-prompt` — confirm the input takes `flex: 1` (it does). No code change required unless the inspection reveals an issue.

If the page does need a fix, add a ≤480px block to its inline `<style>`:

```css
        @media (max-width: 480px) {
          .v2-lookup-form { padding-top: 16px; }
          .v2-lookup-cta { gap: 10px; }
        }
```

- [ ] **Step 2: Verify decodes index card spacing**

Read `apps/web/src/app/decodes/page.tsx`. The grid drops to 1 column at 720px (line 98–100 — already responsive). Card padding is 28px which is fine on mobile. If the title font 26px feels too large on 320px, add:

```css
        @media (max-width: 480px) {
          .v2-decode-card { padding: 22px; min-height: 180px; }
          .v2-decode-card-title { font-size: 22px; }
        }
```

If the file already renders well, skip.

- [ ] **Step 3: Inspect auth pages — no change expected**

Read `apps/web/src/app/(auth)/login/page.tsx`. The card has `max-width: 480px` and uses `Button fullWidth`. The auth layout has `padding: 48px 20px`. Already mobile-friendly. No change.

Same for register.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit (only if any file actually changed)**

```bash
# Stage whichever files you actually modified
git add apps/web/src/app/wallet/page.tsx apps/web/src/app/decodes/page.tsx
git commit -m "feat(web): minor mobile padding tweaks for wallet lookup + decodes index"
```

If neither file needed changes, skip the commit.

---

## Task 10: Build + manual mobile verification

**Files:** none (verification only)

- [ ] **Step 1: Build the web app**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web build`
Expected: PASS — clean build, no TypeScript errors.

If the build fails, fix the offending file before continuing.

- [ ] **Step 2: Start dev server**

Run: `cd /Users/mburkholz/Forge/chainward && pnpm --filter @chainward/web dev`
Expected: dev server up on :3000 (or its configured port).

Run this in the background. Keep the process running for the next step.

- [ ] **Step 3: Manual viewport verification**

Open Chrome DevTools, toggle device toolbar, set width to **375px** (iPhone 13/14/15). Visit each route and confirm:

- `/` (landing) — hero fits, CTAs stack but don't overflow, footer wraps cleanly
- `/base` (observatory) — ticker is single-row scrollable, stat tiles 2-col with readable values, leaderboard tabs scroll horizontally, both tables render as stacked cards (label-value pairs, no horizontal scroll inside tables), charts visible
- `/decodes` — cards stack 1-col, no overflow
- `/wallet` — form input is full width, button visible
- `/login` — terminal card visible, button full-width
- `/docs` — nav fits, content readable

For each page: confirm the page body has **no horizontal scroll bar**. (Internal table scroll on the leaderboard tabs is expected and OK.)

Also test at **320px** (iPhone SE 1st gen) — same checks. The bar is "no horizontal page scroll".

- [ ] **Step 4: Stop the dev server, no commit needed**

If verification revealed broken layouts you couldn't fix in scope, **do not** mark the task complete. Note the issue and stop.

If everything renders cleanly, the implementation is done.

---

## Self-Review Checklist (run after writing every task above)

- **Spec coverage:** Spec sections 1–7 each map to:
  - Spec §1 StatusTicker → Tasks 1, 2 ✓
  - Spec §2 NavBar → Tasks 1, 3 ✓
  - Spec §3 StatTile → Task 4 ✓
  - Spec §4 DataTable mobileCard → Task 5; applied in Tasks 6, 7 ✓
  - Spec §5 Observatory page → Task 6 ✓
  - Spec §6 Landing page → Task 8 ✓
  - Spec §7 Other pages (wallet, decodes, auth) → Task 9 ✓
  - Manual verification → Task 10 ✓
- **Placeholder scan:** No "TBD"/"TODO"/"appropriate". Inspect-first tasks (7, 9) include explicit fallback CSS.
- **Type consistency:** `mobileCard` prop name consistent across tasks 5/6/7. `v2-tbl--mobile-card`, `v2-tbl-cell`, `v2-tbl-cell-label`, `v2-tbl-cell-value` class names consistent across DataTable component (Task 5) and CSS rules (Task 5). `v2-ticker-item--mobile-hide` and `v2-nav-cta-arrow` consistent across CSS (Task 1) and components (Tasks 2, 3).
- **No broken refs:** Task 3 changes the NavBar API; all callers I found (page.tsx, observatory, decodes, wallet) are updated in the same task. Task 1 step 1 instructs grep to find any I missed.
