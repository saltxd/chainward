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
BullMQ cron (Sunday noon UTC)
  → ReportGenerator: query observatory data for past 7 days
  → Compute week-over-week deltas (compare with prior report)
  → Store structured report in weekly_reports table
  → Generate thread text from report data
  → Report available at /reports/weekly/[id]
```

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

**`report_data` JSONB structure:**

```typescript
interface WeeklyReportData {
  // Summary stats
  totalTransactions: number;
  totalTransactionsDelta: number; // vs prior week, percentage
  totalValueEth: string;
  totalValueUsd: string;
  totalValueDelta: number;
  totalGasEth: string;
  totalGasUsd: string;
  totalGasDelta: number;
  activeAgentCount: number;
  activeAgentCountDelta: number;

  // Highlights
  mostActiveAgent: {
    name: string;
    wallet: string;
    txCount: number;
    description: string;
  };
  biggestMover: {
    name: string;
    wallet: string;
    metric: string; // e.g. "largest single tx" or "biggest balance change"
    value: string;
    description: string;
  };
  gasEfficiencyLeader: {
    name: string;
    wallet: string;
    avgGasPerTx: string;
    description: string;
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
    totalValueEth: string;
  }>;
  anomalies: Array<{
    type: string; // "inactivity" | "spike" | "balance_drop" | "new_agent"
    agent: string;
    description: string;
  }>;
}
```

### API Endpoints

**`GET /api/reports/weekly`** — latest report (public, no auth)
**`GET /api/reports/weekly/:id`** — specific report by number (public, no auth)
**`GET /api/reports/weekly/list`** — paginated report archive (public, no auth)

Rate limited at 60/min (same as observatory).

### Report Generator

**Location:** `packages/indexer/src/workers/reportGenerator.ts`

New BullMQ worker with a single repeatable job:
- Cron: `0 12 * * 0` (Sunday noon UTC)
- Queries: Reuse observatory service queries scoped to the 7-day window
- Delta computation: Load prior report from `weekly_reports`, compute percentage changes
- Agent names: Join against `agent_registry` for display names
- A2A data: Query `is_agent_to_agent` column on transactions (already populated by intelligence pipeline)
- Protocol data: Query `weekly_protocol_stats` table (already populated by intelligence worker)

**Key queries needed:**
1. Total tx count + value for observatory agents in date range
2. Total gas consumed in date range
3. Count of distinct active agents (had ≥1 tx)
4. Top N agents by tx count
5. Largest single transaction
6. Largest balance change (compare first and last balance snapshot in range)
7. Lowest avg gas per tx (gas efficiency)
8. A2A transaction count + top pairs
9. Protocol breakdown from `weekly_protocol_stats`
10. Anomaly detection: agents with 0 txs that had txs last week (went silent), agents with >3x normal activity (spike)

### Thread Formatter

**Location:** `packages/indexer/src/workers/threadFormatter.ts`

Takes `WeeklyReportData`, outputs a formatted text block (stored in `thread_text` column):

```
Tweet 1 (hook):
"39 AI agents on Base moved $X this week (+Y% WoW).

Here's what they did 🧵"

Tweet 2 (most active):
"Most Active: [Agent Name]
[X] transactions this week — [description of what they were doing]"

Tweet 3 (biggest mover):
"Biggest Mover: [Agent Name]
[Description of the notable transaction or balance change]"

Tweet 4 (gas + efficiency):
"Gas Report:
Total consumed: [X] ETH ($Y)
Most efficient: [Agent] at [Z] ETH/tx
[Delta vs last week]"

Tweet 5 (A2A or protocol):
"Agent-to-Agent Activity:
[X] transactions between tracked agents this week
[Notable pairs or protocol breakdown]"

Tweet 6 (CTA):
"Full report with charts and data:
chainward.ai/reports/weekly

Want real-time monitoring for your agents?
Connect your wallet — it takes 60 seconds."
```

Thread is 6 tweets. No emojis except the thread indicator 🧵 on tweet 1. Numbers are rounded for readability. Dollar amounts use K/M suffixes.

### Web Pages

**`/reports/weekly` — Latest Report Page**

Location: `apps/web/src/app/reports/weekly/page.tsx`

Server component that fetches latest report, renders:
- Report header: "Base Agent Intelligence Report #[N]" + date range + "Week [N] of tracking"
- Summary stat cards (same style as observatory): total txs, total value, total gas, active agents — all with WoW deltas
- "Highlights" section: most active, biggest mover, gas leader — card per highlight
- Activity chart: bar chart of daily tx volume for the week (Recharts)
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

### Sitemap & SEO

- Add `/reports/weekly` to existing sitemap with `weekly` changefreq
- Each report page gets unique OG image (or reuse observatory OG with report number overlay — v2)
- JSON-LD `Dataset` schema on each report page

## What This Does NOT Include

- **No Twitter API integration** — thread is generated as text, posted manually
- **No email distribution** — future enhancement
- **No AI-generated prose** — templates with real numbers, not LLM fluff
- **No subscriber/notification system** — the page is the product
- **No PDF export** — web-first
- **No "analyst agent" wallet** — cut for v1 scope (cool but unnecessary for launch)
- **No custom OG images per report** — reuse site OG image

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

1. **Migration + Drizzle schema** — `0008_weekly_reports.sql`, add table to Drizzle schema
2. **Report generator worker** — aggregation queries, delta computation, store to DB
3. **Thread formatter** — template engine that produces tweet text from report data
4. **API endpoints** — 3 public GET routes for latest, by-number, and list
5. **Web pages** — `/reports/weekly`, `/reports/weekly/[number]`, `/reports`
6. **Manual trigger** — ability to run report generation on-demand (for testing + Report #001)
7. **Polish + deploy** — SEO tags, sitemap entry, landing page link, deploy all 3 services

## Testing Strategy

- Run report generator against live observatory data to produce Report #001
- Verify all queries return sensible data (handle edge cases: agents with 0 txs, missing balance snapshots)
- Verify thread text reads well and fits tweet character limits (280 chars each)
- Visual review of report page on desktop and mobile
- Check SEO tags render correctly (OG preview tools)

## Success Metrics

- Report #001 published within build week
- Thread posted, gets >10 impressions (baseline for a new account)
- Report page indexed by Google within 2 weeks
- At least 1 new observatory agent submission by Report #004
- "ChainWard" appears in search results for "Base agent activity" within 6 weeks
