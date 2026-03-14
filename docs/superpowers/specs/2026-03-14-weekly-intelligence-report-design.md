# Base Agent Intelligence Report — Design Spec

## Problem

ChainWard's observatory tracks 39 AI agent wallets on Base in real-time, collecting transaction volumes, gas consumption, balance changes, A2A interactions, and protocol usage. This data is valuable intelligence that nobody else publishes. Currently it sits behind the observatory dashboard, visible only to visitors who find the site.

The GTM plan was written weeks ago but nothing has been executed. The bottleneck is sustained content production by a solo operator. The solution must generate marketing content automatically from existing data infrastructure.

## Solution

A weekly automated report system that:
1. Aggregates observatory data into a structured "State of Base Agents" intelligence report
2. Publishes it as a public SEO-optimized page on chainward.ai
3. Generates a pre-formatted Twitter thread for manual posting (3 minutes/week)
4. Stores historical reports for trend analysis over time

## Why This Is The Play

- **Data already exists.** Observatory infrastructure collects everything needed.
- **Automated after build.** Solo-operator-proof — runs itself every week.
- **Compounds over time.** Week 1 is interesting. Week 20 has irreproducible historical trends.
- **Category authority.** "According to ChainWard data..." becomes the citation for agent activity on Base.
- **Direct conversion funnel.** Every report ends with "Want this for YOUR agents?"
- **Defensible.** Requires real infrastructure to produce. Can't be faked or copied quickly.

## Architecture

### Data Flow

```
BullMQ cron (Monday 06:00 UTC — after ISO week ends Sunday midnight)
  → ReportGenerator: query observatory data for the completed ISO week (Mon 00:00 → Sun 23:59:59)
  → Compute week-over-week deltas (compare with prior report, null if first report)
  → Store structured report in weekly_reports table
  → Generate thread text from report data
  → Report available at /reports/weekly/latest and /reports/weekly/[number]
```

### Week Boundaries

Reports use **ISO weeks** (Monday 00:00 UTC through Sunday 23:59:59 UTC). The generation job runs Monday at 06:00 UTC, giving a buffer after the week closes. This aligns with the existing `weekly_protocol_stats` aggregation which also uses ISO weeks.

### Database

**New table: `weekly_reports`**

```sql
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number INTEGER NOT NULL UNIQUE,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  report_data JSONB NOT NULL,
  thread_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_reports_number ON weekly_reports(report_number DESC);
```

**Report number assignment:** `SELECT COALESCE(MAX(report_number), 0) + 1 FROM weekly_reports` at generation time.

**Drizzle schema file:** `packages/db/src/schema/weeklyReports.ts` — export from `packages/db/src/schema/index.ts`. The `report_data` column uses `jsonb('report_data').$type<WeeklyReportData>()`.

**`report_data` JSONB structure:**

```typescript
interface WeeklyReportData {
  // Summary stats (all monetary values in USD only — no ETH conversion needed)
  totalTransactions: number;
  totalTransactionsDelta: number | null; // null on first report
  totalValueUsd: string; // sum of amount_usd from transactions
  totalValueDelta: number | null;
  totalGasEth: string; // sum of gas_cost_native
  totalGasUsd: string; // sum of gas_cost_usd
  totalGasDelta: number | null;
  activeAgentCount: number;
  activeAgentCountDelta: number | null;

  // Highlights
  mostActiveAgent: {
    name: string;
    wallet: string;
    txCount: number;
  };
  biggestMover: {
    name: string;
    wallet: string;
    type: 'largest_tx' | 'balance_change';
    valueUsd: string;
    // Template-generated description, e.g.:
    //   largest_tx: "Executed a $4,200 transaction on Aerodrome"
    //   balance_change: "Balance changed by -$1,800 over the week"
    description: string;
  };
  gasEfficiencyLeader: {
    name: string;
    wallet: string;
    avgGasPerTxEth: string;
  };

  // Sections
  a2aActivity: {
    totalA2aTransactions: number;
    notablePairs: Array<{
      from: string;
      to: string;
      txCount: number;
    }>;
  };
  protocolBreakdown: Array<{
    protocol: string;
    txCount: number;
    percentage: number;
  }>;
  topAgentsByTxCount: Array<{
    name: string;
    wallet: string;
    txCount: number;
    totalValueUsd: string;
  }>;
  anomalies: Array<{
    type: 'inactivity' | 'spike' | 'balance_drop' | 'new_agent';
    agent: string;
    description: string;
  }>;
}
```

### Biggest Mover Selection Logic

Compare two candidates:
1. **Largest single transaction** — highest `amount_usd` in the week across observatory agents
2. **Largest balance change** — greatest absolute difference between first and last `balance_snapshots` entry in the week

Pick whichever has the higher USD magnitude. Generate description from template:
- `largest_tx`: `"Executed a ${formatUsd(valueUsd)} transaction${protocol ? ' on ' + protocol : ''}"`
- `balance_change`: `"Balance changed by ${sign}${formatUsd(valueUsd)} over the week"`

### API Endpoints

**`GET /api/reports/weekly/latest`** — latest report (public, no auth)
**`GET /api/reports/weekly/:number`** — specific report by number (public, no auth)
**`GET /api/reports/weekly`** — paginated report archive, `?page=1&limit=10` (public, no auth)

Routes registered in this order in Hono: `/latest` first, then `/:number`. No ambiguity.

Rate limited at 60/min (same as observatory).

### Report Generator

**Location:** `packages/indexer/src/workers/reportGenerator.ts`

New BullMQ worker with a single repeatable job:
- Cron: `0 6 * * 1` (Monday 06:00 UTC — after ISO week ends)
- Queries scoped to observatory agents only: `WHERE agent_registry.is_observatory = true`
- Delta computation: Load prior report from `weekly_reports`, compute percentage changes. If no prior report exists, all delta fields are `null`.
- Agent names: Join against `agent_registry` for display names
- A2A data: Query `is_agent_interaction` column on transactions (populated by intelligence pipeline's `agentResolver`)
- Protocol data: Query `transactions` table directly, grouped by decoded protocol, filtered to observatory wallets only. Do NOT reuse `weekly_protocol_stats` (which includes non-observatory agents).

**Key queries:**
1. Total tx count + `SUM(amount_usd)` for observatory agents in ISO week
2. `SUM(gas_cost_native)` + `SUM(gas_cost_usd)` in ISO week
3. `COUNT(DISTINCT wallet_address)` with ≥1 tx
4. Top 10 agents by tx count, joined with `agent_registry` for names
5. Single transaction with highest `amount_usd` (for biggestMover candidate 1)
6. Greatest absolute balance delta: compare earliest and latest `balance_snapshots` per agent in the week (for biggestMover candidate 2)
7. Agent with lowest `SUM(gas_cost_native) / COUNT(*)` having ≥3 txs (gas efficiency)
8. `COUNT(*) WHERE is_agent_interaction = true`, top pairs by `(from_address, to_address)` grouping
9. Protocol breakdown: `GROUP BY` decoded contract/protocol on transactions for observatory wallets
10. Anomaly detection (see below)

### Anomaly Detection

**Inactivity:** Agents that had ≥1 tx in the prior week but 0 txs this week. Skip if no prior report exists.

**Spike:** Agents whose tx count this week is ≥3x their average weekly tx count over the prior 4 weeks. Skip if fewer than 3 prior weekly reports exist (insufficient baseline).

**Balance drop:** Agents whose balance decreased by >50% during the week (compare first and last snapshot).

**New agent:** Any agent added to the observatory during this week (check `created_at` on `agent_registry`).

### Thread Formatter

**Location:** `packages/indexer/src/lib/threadFormatter.ts` (pure function, not a worker)

Takes `WeeklyReportData` + `reportNumber`, outputs a formatted text block. Each tweet is capped at 280 characters — the formatter truncates agent names at 20 chars and descriptions at 100 chars with ellipsis if needed.

```
Tweet 1 (hook):
"Base Agent Intelligence Report #[N]

[activeAgentCount] AI agents on Base moved $[totalValueUsd] this week[deltaStr].

What they did 🧵"

(deltaStr = " (+Y% WoW)" if delta is not null, "" if first report)

Tweet 2 (most active):
"Most Active: [Agent Name]
[X] transactions this week"

Tweet 3 (biggest mover):
"Biggest Mover: [Agent Name]
[description]"

Tweet 4 (gas + efficiency):
"Gas Report:
Total consumed: [X] ETH ($Y)
Most efficient: [Agent] at [Z] ETH/tx"

Tweet 5 (A2A or protocol):
If a2aActivity.totalA2aTransactions > 0:
  "Agent-to-Agent: [X] transactions between tracked agents this week"
Else, show protocol breakdown:
  "Protocol Activity:
  [top 3 protocols with percentages]"

Tweet 6 (CTA):
"Full report: chainward.ai/reports/weekly/latest

Track your own agents — 60 seconds to set up.
chainward.ai"
```

Thread is 6 tweets. No emojis except 🧵 on tweet 1. Numbers rounded for readability. Dollar amounts use K/M suffixes ($1.2K, $3.4M).

### Web Pages

**`/reports/weekly/latest` — Latest Report Page**

Location: `apps/web/src/app/reports/weekly/latest/page.tsx`

Server component that fetches latest report via API proxy, renders:
- Report header: "Base Agent Intelligence Report #[N]" + date range
- Summary stat cards (same style as observatory): total txs, total value, total gas, active agents — all with WoW deltas (show "First report" badge instead of delta on Report #1)
- "Highlights" section: most active, biggest mover, gas leader — card per highlight
- Activity chart: bar chart of daily tx volume for the week (Recharts, brand green)
- Top agents table: ranked by tx count with value and gas
- A2A section: if any A2A activity, show pairs
- Protocol breakdown: horizontal bar chart
- Anomalies section: if any, list them
- CTA banner: "Want this intelligence for your agents?" + Connect Wallet button
- Archive link: "View past reports →"
- SEO: OG tags with report number + headline stat, JSON-LD Dataset

**`/reports/weekly/[number]` — Historical Report**

Location: `apps/web/src/app/reports/weekly/[number]/page.tsx`

Same layout as latest, but fetches by report number. Includes prev/next navigation.

**`/reports` — Archive Page**

Location: `apps/web/src/app/reports/page.tsx`

List of all published reports with date range, headline stat, and link. Simple grid layout.

### Manual Trigger

**Location:** `packages/indexer/src/scripts/generateReport.ts`

A standalone script runnable via `npx tsx packages/indexer/src/scripts/generateReport.ts`. Connects to DB and Redis, enqueues the report generation job immediately. Used for testing and generating Report #001.

Add npm script: `"report:generate": "tsx src/scripts/generateReport.ts"` in `packages/indexer/package.json`.

### Sitemap & SEO

- Add `/reports/weekly/latest` to existing sitemap with `weekly` changefreq
- Individual report pages (`/reports/weekly/1`, etc.) won't be in the static sitemap initially — switch to dynamic `app/sitemap.ts` as a v2 enhancement when the archive grows
- JSON-LD `Dataset` schema on each report page

## What This Does NOT Include

- **No Twitter API integration** — thread is generated as text, posted manually
- **No email distribution** — future enhancement
- **No AI-generated prose** — templates with real numbers, not LLM fluff
- **No subscriber/notification system** — the page is the product
- **No PDF export** — web-first
- **No "analyst agent" wallet** — cut for v1 scope (cool but unnecessary for launch)
- **No custom OG images per report** — reuse site OG image
- **No dynamic sitemap** — static sitemap with `/reports/weekly/latest` only for now

## Migration

**File:** `packages/db/src/migrations/0008_weekly_reports.sql`

```sql
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number INTEGER NOT NULL UNIQUE,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  report_data JSONB NOT NULL,
  thread_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_number
  ON weekly_reports(report_number DESC);
```

## Build Order

1. **Migration + Drizzle schema** — `0008_weekly_reports.sql`, create `packages/db/src/schema/weeklyReports.ts`, export from index
2. **Report generator worker** — aggregation queries (observatory-scoped), delta computation, store to DB
3. **Thread formatter** — pure function, template engine with 280-char truncation
4. **API endpoints** — 3 public GET routes: `/latest`, `/:number`, list with pagination
5. **Web pages** — `/reports/weekly/latest`, `/reports/weekly/[number]`, `/reports`
6. **Manual trigger script** — `packages/indexer/src/scripts/generateReport.ts` + npm script
7. **Polish + deploy** — SEO tags, sitemap entry, landing page link, deploy all 3 services

## Testing Strategy

- Run report generator via manual trigger against live observatory data to produce Report #001
- Verify all queries return sensible data (handle edge cases: agents with 0 txs, missing balance snapshots, first report with null deltas)
- Verify thread text reads well and fits tweet character limits (280 chars each) — test with long agent names
- Visual review of report page on desktop and mobile
- Check SEO tags render correctly (OG preview tools)
- Verify Report #1 renders correctly with null deltas (no "NaN%" or "undefined")

## Success Metrics

- Report #001 published within build week
- Thread posted, gets >10 impressions (baseline for a new account)
- Report page indexed by Google within 2 weeks
- At least 1 new observatory agent submission by Report #004
- "ChainWard" appears in search results for "Base agent activity" within 6 weeks
