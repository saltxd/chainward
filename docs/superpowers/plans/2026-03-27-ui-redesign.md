# ChainWard UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ChainWard from generic AI aesthetic to a data-dense, Arkham Intelligence-style professional intelligence tool.

**Architecture:** CSS-first redesign using Tailwind v4's `@theme` directive in `globals.css`. All hardcoded hex values consolidated into CSS variables. Observatory page restructured to two-column layout with leaderboard + live feed above fold. No new features — visual/UX pass only.

**Tech Stack:** Next.js 15, Tailwind CSS v4, Recharts, next/font, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-27-ui-redesign-design.md`

---

## File Map

### New Files
- `apps/web/src/lib/design-tokens.ts` — framework badge colors, shared constants
- (No other new files — this is a visual pass on existing files)

### Modified Files (grouped by task)

**Task 1 — Design System:**
- `apps/web/src/app/globals.css` — new color palette, border-radius reset
- `apps/web/src/app/layout.tsx` — next/font imports for Inter + JetBrains Mono

**Task 2 — Observatory Page:**
- `apps/web/src/app/base/observatory-page.tsx` — full layout restructure (763 lines)

**Task 3 — Sidebar + Dashboard Layout:**
- `apps/web/src/components/layout/sidebar.tsx` — remove version, active state style, alert badge
- `apps/web/src/app/(dashboard)/layout.tsx` — minor palette alignment

**Task 4 — Dashboard Overview:**
- `apps/web/src/app/(dashboard)/overview/page.tsx` — stat ticker, empty state handling

**Task 5 — Landing Page:**
- `apps/web/src/app/page.tsx` — remove ClawHub, dynamic count, kill beta language, sharp corners
- `apps/web/src/components/landing/activity-feed.tsx` — connect to real data or replace
- `apps/web/src/components/landing/observatory-stats.tsx` — palette alignment
- `apps/web/src/components/landing/feature-grid.tsx` — palette alignment
- `apps/web/src/components/landing/cli-terminal.tsx` — palette alignment

**Task 6 — Digest + Remaining Pages:**
- `apps/web/src/app/base/digest/digest-client.tsx` — grid fix, palette alignment
- `apps/web/src/app/(dashboard)/agents/page.tsx` — remove Solana dropdown
- `apps/web/src/components/ui/stat-card.tsx` — sharp corners, palette
- `apps/web/src/components/layout/public-header.tsx` — palette alignment

---

## Task 1: Design System Foundation

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/design-tokens.ts`

- [ ] **Step 1: Update color palette in globals.css**

Replace the entire `@theme` block in `apps/web/src/app/globals.css` (lines 3-21):

```css
@theme {
  /* Backgrounds */
  --color-background: #0a0e14;
  --color-foreground: #e6edf3;
  --color-muted: #0d1117;
  --color-muted-foreground: #8b949e;
  --color-card: #0d1117;
  --color-card-foreground: #e6edf3;
  --color-border: rgba(255,255,255,0.06);

  /* Brand */
  --color-primary: #1B5E20;
  --color-primary-foreground: #ffffff;
  --color-accent: #1B5E20;
  --color-accent-foreground: #4ade80;
  --color-ring: #1B5E20;

  /* Semantic */
  --color-destructive: #f87171;
  --color-destructive-foreground: #ffffff;
  --color-warning: #fbbf24;
  --color-link: #79c0ff;
  --color-text-muted: #484f58;
  --color-surface: rgba(255,255,255,0.02);
  --color-border-hover: rgba(255,255,255,0.12);

  /* Service colors */
  --color-discord: #5865f2;
  --color-telegram: #26a5e4;

  /* Typography */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 2: Add global border-radius reset**

After the `@theme` block, add before the `body` rule:

```css
/* Sharp corners everywhere — pro tool aesthetic */
* {
  border-radius: 0;
}
```

Note: components that need pills/badges will use explicit `rounded-full` or `rounded-sm` (2px). This reset kills all inherited `rounded-lg`, `rounded-xl`, etc.

- [ ] **Step 3: Add next/font imports in layout.tsx**

Update `apps/web/src/app/layout.tsx` — add font imports at the top and apply to html element:

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});
```

Apply font variables to `<html>` tag:
```tsx
<html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable}`}>
```

Remove the `--font-sans` and `--font-mono` declarations from the `@theme` block in globals.css (next/font injects them via CSS variables automatically).

- [ ] **Step 4: Create design tokens constants file**

Create `apps/web/src/lib/design-tokens.ts`:

```typescript
export const FRAMEWORK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  virtuals: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Virtuals' },
  olas: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Olas' },
  elizaos: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'ElizaOS' },
  agentkit: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'AgentKit' },
  custom: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Custom' },
} as const;

export const DIRECTION_STYLES = {
  IN: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'IN' },
  OUT: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'OUT' },
} as const;
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: 11/11 pass

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/lib/design-tokens.ts
git commit -m "design: new color palette, font loading, design tokens

Replace CSS variable palette with Arkham-style dark theme.
Add next/font imports for Inter + JetBrains Mono.
Create framework badge and direction pill constants.
Global border-radius reset for sharp corners."
```

---

## Task 2: Observatory Page Redesign

**Files:**
- Modify: `apps/web/src/app/base/observatory-page.tsx` (major rewrite, 763 lines)

This is the biggest task. The observatory page needs to be restructured from its current layout (stats → charts → feed → leaderboard) to the new layout (status bar → stat ticker → leaderboard+feed two-column → charts → CTA).

- [ ] **Step 1: Update helper components (lines 127-208)**

Replace `StatCard` (lines 139-163) with a compact inline stat for the ticker:

```tsx
function TickerStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-foreground text-sm font-semibold">{value}</span>
      {sub && <span className="font-mono text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}
```

Update `FRAMEWORK_COLORS` and `FrameworkBadge` to import from `@/lib/design-tokens` instead of inline definition. Update `DirectionBadge` similarly.

Replace all hardcoded hex color references throughout the component with Tailwind theme classes:
- `text-[#4ade80]` → `text-accent-foreground`
- `bg-[#0a0a0f]` → `bg-background`
- `border-[#1a1a2e]` → `border-border`
- `text-[#71717a]` → `text-muted-foreground`
- `bg-[#111827]` → `bg-card`
- etc.

Replace all `rounded-lg`, `rounded-xl` on containers with `rounded-sm`.

- [ ] **Step 2: Restructure navigation bar (lines 393-422)**

Keep the nav structure but replace with slim status bar pattern:

```tsx
{/* Status bar */}
<div className="flex items-center justify-between border-b border-border px-4 py-2">
  <div className="flex items-center gap-4">
    <Link href="/" className="flex items-center gap-2">
      <Image src="/chainward-logo-128.png" alt="ChainWard" width={20} height={20} />
      <span className="text-sm font-semibold text-foreground">ChainWard</span>
    </Link>
    <nav className="flex items-center gap-3 text-xs text-muted-foreground">
      <Link href="/base" className="text-foreground">Observatory</Link>
      <Link href="/wallet" className="hover:text-foreground">Wallet Lookup</Link>
    </nav>
  </div>
  <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
    <span className="flex items-center gap-1.5">
      <PulseDot /> Tracking {overview?.agentsTracked ?? '—'} agents
    </span>
    <Link href="/login" className="rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:border-border-hover">
      Connect Wallet
    </Link>
  </div>
</div>
```

- [ ] **Step 3: Replace hero + stats with compact ticker row (lines 424-483)**

Remove the title section (lines 424-456) and stat cards grid (lines 458-483). Replace with:

```tsx
{/* Stat ticker */}
<div className="flex items-center gap-6 border-b border-border px-4 py-2.5 overflow-x-auto">
  <TickerStat label="Agents" value={String(overview?.agentsTracked ?? 0)} />
  <div className="h-3 w-px bg-border" />
  <TickerStat label="Active (24h)" value={String(overview?.activeAgents7d ?? 0)} />
  <div className="h-3 w-px bg-border" />
  <TickerStat label="Txns (24h)" value={(overview?.txCount24h ?? 0).toLocaleString()} />
  <div className="h-3 w-px bg-border" />
  <TickerStat label="Gas (24h)" value={formatUsd(overview?.gasBurned24h ?? 0)} />
  <div className="h-3 w-px bg-border" />
  <TickerStat label="Portfolio" value={formatUsd(overview?.totalPortfolioUsd ?? 0)} />
</div>
```

- [ ] **Step 4: Build two-column layout — leaderboard + live feed (replaces lines 485-700)**

This is the core layout change. The current order is: charts → feed → leaderboard. New order: leaderboard (left 60%) + feed (right 40%) side by side, above fold.

```tsx
{/* Two-column: Leaderboard + Live Feed */}
<div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-5">
  {/* Left: Leaderboard (3/5 width) */}
  <div className="col-span-3 bg-background p-4">
    <LeaderboardSection data={leaderboard} loading={loading} />
  </div>

  {/* Right: Live Feed (2/5 width) */}
  <div className="col-span-2 bg-background p-4">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-foreground">Live Transactions</h2>
      <PulseDot />
    </div>
    <div className="space-y-0 divide-y divide-border max-h-[520px] overflow-y-auto">
      {loading ? (
        Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))
      ) : feed.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No recent transactions</p>
      ) : (
        feed.map((item) => (
          <div key={item.txHash} className="flex items-center gap-3 py-2 text-xs hover:bg-surface">
            <span className="font-mono text-text-muted w-10 shrink-0">{timeAgo(item.timestamp)}</span>
            <span className="text-foreground truncate max-w-[120px]">
              {item.agentName ?? truncateAddress(item.walletAddress)}
            </span>
            <DirectionBadge direction={item.direction} />
            <span className="text-muted-foreground">{item.token}</span>
            <span className="ml-auto font-mono text-foreground">{formatUsd(item.amountUsd)}</span>
          </div>
        ))
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 5: Move charts below two-column section (replaces current chart section)**

Half-width side by side, reduced height, area fills:

```tsx
{/* Charts */}
<div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-2">
  <div className="bg-background p-4">
    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Transaction Volume (30d)
    </h3>
    <div className="h-[180px]">
      {/* Recharts AreaChart — replace LineChart, add area fill */}
      {/* ... existing chart logic with: */}
      {/* - height reduced from ~280 to 180 */}
      {/* - Line → Area with fill={accent-foreground} fillOpacity={0.1} */}
      {/* - stroke={accent-foreground color} */}
    </div>
  </div>
  <div className="bg-background p-4">
    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Gas Spend (30d)
    </h3>
    <div className="h-[180px]">
      {/* Recharts AreaChart — replace BarChart, add area fill */}
    </div>
  </div>
</div>
```

- [ ] **Step 6: Update leaderboard component (lines 210-329)**

Update `LeaderboardSection` styling:
- Replace `rounded-lg` with `rounded-sm` on all containers
- Replace hardcoded hex colors with theme classes
- Add row hover: `hover:bg-surface`
- Top 3 ranks get subtle highlight: `{i < 3 ? 'bg-surface' : ''}`
- Make agent names clickable: wrap in `<Link href={/agent/${entry.walletAddress}}>`
- All data values use `font-mono`
- Tab buttons: sharp corners, border-based active state

- [ ] **Step 7: Simplify CTA and footer (lines 702-760)**

Replace the large gradient CTA box with a compact footer CTA:

```tsx
{/* CTA */}
<div className="border-t border-border px-4 py-6 text-center">
  <p className="text-sm text-muted-foreground">
    Private monitoring for your agents —{' '}
    <Link href="/login" className="text-accent-foreground hover:underline">
      Start monitoring
    </Link>
  </p>
</div>
```

Remove the gradient box, radial overlay, and oversized heading.

- [ ] **Step 8: Remove background grid decoration**

Delete the background grid SVG pattern (lines 382-391). Clean dark background only.

- [ ] **Step 9: Typecheck, test, and commit**

Run: `pnpm typecheck`
Run: `pnpm build` (verify no SSR errors)

```bash
git add apps/web/src/app/base/observatory-page.tsx
git commit -m "ui: redesign observatory — data-dense two-column layout

Replace hero + stat cards with compact ticker bar.
Two-column layout: leaderboard (60%) + live feed (40%) above fold.
Charts moved below, half-width side-by-side, reduced height.
Sharp corners, monospace data, consolidated theme colors.
Compact CTA footer replacing oversized gradient box."
```

---

## Task 3: Sidebar + Dashboard Layout

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Remove version string**

Delete line 62 in sidebar.tsx:
```tsx
<div className="text-xs text-muted-foreground">ChainWard v0.0.1</div>
```

- [ ] **Step 2: Update active nav item style**

Replace active state class (line ~39):
```tsx
// FROM:
'bg-accent text-accent-foreground'
// TO:
'border-l-2 border-accent-foreground text-accent-foreground bg-transparent'
```

Keep hover state: `hover:bg-muted hover:text-foreground`

- [ ] **Step 3: Replace rounded corners on sidebar elements**

- Register Agent button: `rounded-lg` → `rounded-sm`
- Mobile drawer: `rounded-lg` → `rounded-sm`
- FAB button: keep `rounded-full` (circle is intentional)

- [ ] **Step 4: Typecheck and commit**

```bash
git add apps/web/src/components/layout/sidebar.tsx
git commit -m "ui: sidebar — remove version, sharp corners, green border active state"
```

---

## Task 4: Dashboard Overview

**Files:**
- Modify: `apps/web/src/app/(dashboard)/overview/page.tsx`

- [ ] **Step 1: Replace stat cards with compact ticker**

Replace the 4-column stat card grid (lines 43-77) with a horizontal ticker row matching the observatory pattern.

- [ ] **Step 2: Handle empty chart states**

For Volume and Gas charts: if all data points are 0, render a text message instead of a flat-line chart:

```tsx
{hasVolumeData ? (
  <VolumeChart data={volume} />
) : (
  <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
    No transaction volume yet. Data appears when your agents transact.
  </div>
)}
```

- [ ] **Step 3: Sharp corners and palette alignment**

Replace all `rounded-lg`/`rounded-xl` with `rounded-sm`. Replace hardcoded hex values with theme classes.

- [ ] **Step 4: Typecheck and commit**

```bash
git add apps/web/src/app/(dashboard)/overview/page.tsx
git commit -m "ui: dashboard overview — compact ticker, empty state handling, sharp corners"
```

---

## Task 5: Landing Page

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/landing/activity-feed.tsx`
- Modify: `apps/web/src/components/landing/observatory-stats.tsx`
- Modify: `apps/web/src/components/landing/feature-grid.tsx`
- Modify: `apps/web/src/components/landing/cli-terminal.tsx`

- [ ] **Step 1: Fix bugs in page.tsx**

1. Remove ClawHub link and badge (line ~257):
   Delete the entire ClawHub/OpenClaw list item.

2. Replace hardcoded "329+" with dynamic count:
   The `observatory-stats.tsx` component already fetches live data. Use that count where "329+" appears.

3. Kill "free during beta" language:
   - Line ~146: "Founder-supported beta for early Base agent teams" → "Real-time intelligence for AI agent wallets on Base"
   - All "Free during beta" CTAs → "Start Monitoring"
   - Pricing section: hide the 25 USDC tier or add "Coming soon" label; keep Free tier as primary

4. Remove "Solana (coming soon)" from `apps/web/src/app/(dashboard)/agents/page.tsx` line ~197.

- [ ] **Step 2: Update activity feed**

Replace hardcoded dummy data in `activity-feed.tsx` with a fetch from `/api/observatory/feed?limit=6`. If the fetch fails or returns empty, show a static but honest representation using real agent names from the observatory.

Replace all hardcoded hex colors with theme classes.

- [ ] **Step 3: Sharp corners and palette on all landing components**

Sweep through `page.tsx`, `feature-grid.tsx`, `cli-terminal.tsx`, `observatory-stats.tsx`:
- Replace `rounded-lg`/`rounded-xl`/`rounded-2xl` with `rounded-sm`
- Replace hardcoded hex colors with theme classes
- Ensure all data values use `font-mono`

- [ ] **Step 4: Typecheck and commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/landing/ apps/web/src/app/\(dashboard\)/agents/page.tsx
git commit -m "ui: landing page — kill beta language, real data feed, sharp corners, remove ClawHub"
```

---

## Task 6: Digest + Remaining Pages

**Files:**
- Modify: `apps/web/src/app/base/digest/digest-client.tsx`
- Modify: `apps/web/src/components/ui/stat-card.tsx`
- Modify: `apps/web/src/components/layout/public-header.tsx`

- [ ] **Step 1: Fix digest grid layouts**

In `digest-client.tsx`:
- Line ~969: `lg:grid-cols-5` → `lg:grid-cols-4` (or `lg:grid-cols-3` if New Agents is hidden)
- Line ~450 (spotlight): `lg:grid-cols-5` → `lg:grid-cols-4`

- [ ] **Step 2: Sharp corners and palette on digest**

Replace all `rounded-lg`/`rounded-xl` with `rounded-sm`. Replace hardcoded hex values with theme classes throughout the 1000+ line file.

- [ ] **Step 3: Update shared UI components**

`stat-card.tsx`: Replace `rounded-lg` with `rounded-sm`, align border color to `border-border`.

`public-header.tsx`: Sharp corners on buttons, align colors to theme.

- [ ] **Step 4: Typecheck, full build, and commit**

Run: `pnpm typecheck && pnpm build`
Verify no build errors across all 11 packages.

```bash
git add apps/web/
git commit -m "ui: digest grid fix, sharp corners and palette sweep on remaining pages"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Deploy to K3s and verify live**

```bash
git push origin main
# Wait for GHCR build
./deploy/deploy.sh --tag $(git rev-parse --short HEAD) --skip-migrate
```

- [ ] **Step 2: Visual verification**

Visit each page and verify:
- [ ] `chainward.ai/base` — observatory: ticker bar, two-column layout, no rounded corners
- [ ] `chainward.ai/base/digest` — correct grid, no gas columns, sharp corners
- [ ] `chainward.ai` — landing: no beta language, no ClawHub, real activity data
- [ ] `chainward.ai/login` → dashboard — no v0.0.1, green border active nav
- [ ] `chainward.ai/wallet` — sharp corners, monospace data
- [ ] Mobile: check responsive breakpoints on all pages

- [ ] **Step 3: Final commit if any hotfixes needed**
