# ChainWard UI Redesign — Design Spec

## Overview

Visual overhaul of ChainWard's web app from generic AI-generated aesthetic to a data-dense, professional intelligence tool. Inspired by Arkham Intelligence, Linear, and Datadog. No new features — visual/UX pass only.

## Design System Changes

### Color Palette (CSS Variables — globals.css)

Replace existing palette with:

```css
--bg-primary: #0a0e14
--bg-secondary: #0d1117
--bg-surface: rgba(255,255,255,0.02)
--border: rgba(255,255,255,0.06)
--border-hover: rgba(255,255,255,0.12)
--text-primary: #e6edf3
--text-secondary: #8b949e
--text-muted: #484f58
--accent: #4ade80
--accent-dark: #1B5E20
--danger: #f87171
--warning: #fbbf24
--link: #79c0ff
--discord: #5865f2
--telegram: #26a5e4
```

All hardcoded hex values in components (`text-[#4ade80]`, `bg-[#0a0a0f]`, etc.) must be replaced with CSS variable references (`text-accent`, `bg-primary`, etc.). No arbitrary Tailwind color classes after this redesign.

### Typography

- **Font loading:** Add `next/font` imports for Inter (sans) and JetBrains Mono (mono) in root layout. Remove the unloaded CSS variable references.
- **Rule:** Monospace (`font-mono`) for ALL data — numbers, wallet addresses, timestamps, values, percentages. Sans-serif for labels, headings, body copy only.

### Border Radius

- **Max 2px (`rounded-sm`)** on cards, containers, panels, tables.
- **Exception:** Pills/badges use `rounded-full`. Avatar circles use `rounded-full`.
- **Kill:** All `rounded-lg`, `rounded-xl`, `rounded-2xl` on containers.

### Framework Badge Colors (constants file)

Create `apps/web/src/lib/framework-colors.ts`:
```
virtuals: purple (#a855f7)
olas: blue (#3b82f6)
elizaos: orange (#f97316)
agentkit: cyan (#06b6d4)
custom: gray (#6b7280)
```

Use these consistently wherever an agent name appears.

## Page Redesigns

### 1. Public Observatory (`/base`) — PRIORITY

**Current:** Four stat cards with whitespace, charts taking too much space, no live feed visible, leaderboard buried below fold.

**New layout:**

```
┌─────────────────────────────────────────────────────┐
│ Status bar: Tracking 329 agents · Block 29M · 12s   │ <- slim, green pulse dot
├─────────────────────────────────────────────────────┤
│ Agents: 329 | Active: 187 | Txns: 2,847 | AUM: $41M│ <- monospace ticker row
├──────────────────────────────┬──────────────────────┤
│ Agent Leaderboard (top 10)   │ Live Transaction Feed│
│ Tabs: Active/Gas/Portfolio   │ Scrolling list       │
│ Framework badges inline      │ Agent, direction,    │
│ Clickable rows → detail      │ amount, timestamp    │
│                              │                      │
│ 60% width                    │ 40% width            │
├──────────────────────────────┴──────────────────────┤
│ Volume (30d)          │  Gas Spend (30d)            │ <- half-width, reduced height
│ Area fill charts      │  Area fill charts           │
├─────────────────────────────────────────────────────┤
│ CTA: Start Monitoring (compact, not hero-sized)     │
└─────────────────────────────────────────────────────┘
```

- Remove giant hero text paragraph
- Status bar is dynamic (fetched from API)
- Stat ticker is a single horizontal row, not cards
- Leaderboard is above fold with tab switching
- Live feed shows real transaction data from `/api/observatory/feed`
- Charts are half-width side-by-side, reduced height, area fills
- CTA is compact footer section

### 2. Private Dashboard (`/overview`)

- Same compact stat ticker pattern (not cards)
- Hide empty charts — if volume/gas data is all zeros, show a single empty state message instead of a flat-line chart
- Give Balance 30d chart more prominence when it has data
- Add "Quick actions" row: Register Agent, Configure Alerts, View Digest — compact buttons

### 3. Transaction Tables (observatory feed, dashboard transactions)

- Filter row at top: agent name, direction (IN/OUT/ALL), token, time range
- Agent names clickable → agent detail page
- Framework badge next to agent name
- Direction pills: IN = green bg/dark green text, OUT = red bg/dark red text
- Amounts right-aligned, monospace, proper formatting
- Tx hash → clickable BaseScan link with external icon
- Row hover state (bg lightens)
- Timestamps: relative display, exact UTC on tooltip

### 4. Agent Leaderboard

- Keep tab switching pattern
- Add framework badges inline with agent names
- Top 3 ranks get subtle visual weight (slightly different bg)
- Sparklines next to agents showing 7d trend (if data available, otherwise skip)

### 5. Sidebar Navigation

- Remove "v0.0.1" version string
- Active nav item: left green border accent (2px solid accent) instead of green bg fill
- Add unread count badge next to "Alerts"

### 6. Landing Page

- Remove ClawHub link and badge
- Keep NPM links (packages are published and live)
- Replace hardcoded "329+" with dynamic count from observatory API
- Fix fake activity feed — connect to real observatory data or replace with a static but honest representation
- Kill "free during beta" from all CTAs — replace with "Start Monitoring" or similar
- Resolve pricing conflict — during beta, hide the 25 USDC tier or clearly mark it as "post-beta"
- Apply sharp corners, monospace data, new color palette
- Remove "Solana (coming soon)" dropdown from agent registration

### 7. Digest Page

- Already cleaned up (gas suppression done)
- Fix grid: `lg:grid-cols-5` → match actual card count (3-4)
- Fix spotlight grid: same issue
- Apply new color palette and sharp corners

## Bug Fixes Included

1. ~~Dead NPM links~~ — packages ARE published, links are valid
2. Remove ClawHub link (unverified)
3. Remove "v0.0.1" from sidebar
4. Dynamic agent count (replace hardcoded "329+")
5. Fix grid layout gaps from gas suppression
6. Resolve "free during beta" vs pricing conflict
7. Remove "Solana (coming soon)" dropdown
8. Fix font loading (add next/font imports)
9. Consolidate all hardcoded hex values into CSS variables

## Implementation Order

1. **Design system foundation** — globals.css palette, next/font loading, framework-colors.ts constants, border-radius sweep
2. **Observatory page** — highest public impact, GTM page
3. **Sidebar + dashboard layout** — affects all authenticated pages
4. **Dashboard overview** — stat ticker, empty state handling
5. **Transaction tables** — shared component used in observatory + dashboard
6. **Landing page** — bug fixes, dynamic data, aesthetic alignment
7. **Digest page** — grid fixes, palette alignment
8. **Remaining pages** — login, wallet lookup, agent detail, docs

## What Does NOT Change

- Green brand color (#4ade80 / #1B5E20)
- ChainWard logo and wordmark
- Leaderboard tab pattern
- Page structure (observatory + dashboard + digest)
- No new features
