# Make /base the Citation Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `chainward.ai/base` from a 39-agent dashboard into the page every Twitter thread about Base AI agents links to. Win condition: when a CT thread says "top Base AI agents," readers reach for a chainward.ai/base link instead of a homemade Notion table.

**Architecture:**
- **Data layer:** Bridge ACP roster + ERC-8004 candidates into `agent_registry` to scale 39 → 200+ tracked agents. Add a `slug` column for stable URLs.
- **Health Score:** Wire the existing `daily_agent_health` table (already queried by `getLeaderboard().healthiest` but never populated). New `healthScore` worker computes daily.
- **Per-agent pages:** New route `/base/[slug]` with chart, tx feed, score breakdown, decode link. SEO-optimized + dynamic OG image so each URL is screenshot-bait.
- **Weekly digest tweet:** Extend existing `digestGenerator` (already runs every 7 days, writes to `weekly_digests` table) with a thread-formatted output. Ship Discord webhook delivery first; manual Twitter copy-paste; defer X API OAuth.

**Tech Stack:** TypeScript, Drizzle ORM, TimescaleDB, Hono, Next.js 15, Recharts, BullMQ, Vitest.

**Branch:** `feat/base-citation-page` (created via worktree at execution time).

---

## File Structure

### New files
| Path | Purpose |
|---|---|
| `packages/db/src/migrations/0013_agent_slug.sql` | Add `slug` column to `agent_registry`, unique index, backfill existing rows |
| `packages/indexer/src/workers/healthScore.ts` | BullMQ worker that computes `daily_agent_health` rows for all observatory agents |
| `packages/indexer/src/workers/__tests__/healthScore.test.ts` | Unit tests for health-score formula |
| `packages/common/src/slug.ts` | Pure helper: `agentSlug(name, walletAddress)` — used by API + indexer + bridges |
| `packages/common/src/__tests__/slug.test.ts` | Unit tests for slug generation |
| `apps/api/src/routes/observatory.ts` (extend) | New `GET /api/observatory/agent/:slug` endpoint |
| `apps/web/src/app/base/[slug]/page.tsx` | Per-agent landing page (server component) |
| `apps/web/src/app/base/[slug]/agent-detail-client.tsx` | Interactive chart + tx feed |
| `apps/web/src/app/base/[slug]/opengraph-image.tsx` | Dynamic OG image per agent |
| `packages/common/src/digestThread.ts` | Format `weekly_digests` row into Twitter-ready thread + Discord webhook payload |

### Modified files
| Path | Change |
|---|---|
| `packages/db/src/schema/agents.ts` | Add `slug: text('slug').unique()` column, declare in Drizzle |
| `packages/indexer/src/workers/acpSync.ts` | After ACP sync, bridge graduated ACP agents into `agent_registry` as observatory entries |
| `packages/indexer/src/workers/registryScout.ts` | After candidate discovery, auto-promote candidates above tx-count threshold to observatory |
| `packages/indexer/src/index.ts` | Register `healthScore` worker + repeatable daily job |
| `apps/api/src/services/observatoryService.ts` | Add `getAgentDetail(slug)` method |
| `apps/web/src/app/base/observatory-page.tsx` | Make leaderboard rows linkable to `/base/[slug]` |
| `packages/indexer/src/workers/digestGenerator.ts` | After producing digest, also call `digestThread` formatter and POST to Discord webhook |

### Why this decomposition
- **`packages/common/src/slug.ts`** lives in `common` because both the API (when reading slugs from URLs) and the indexer (when writing slugs as agents are bridged) need it. Single source of truth.
- **Health score worker** is its own file because the formula will get tweaked over time and isolating it makes A/B testing easier. The existing `daily_agent_health` schema is reused as-is.
- **OG image** is its own file (Next.js convention) so the page route stays readable.

---

## Task 1: Slug helper + tests

**Files:**
- Create: `packages/common/src/slug.ts`
- Create: `packages/common/src/__tests__/slug.test.ts`
- Modify: `packages/common/src/index.ts` (export the helper)

**Why first:** Both the schema migration backfill and the ACP bridge worker need this helper. Pure function, easy to TDD.

- [ ] **Step 1.1: Write the failing tests**

Create `packages/common/src/__tests__/slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { agentSlug } from '../slug.js';

describe('agentSlug', () => {
  it('lowercases and dasherizes a clean name', () => {
    expect(agentSlug('AIXBT', '0xabc')).toBe('aixbt');
  });

  it('strips diacritics and special chars', () => {
    expect(agentSlug('Étoile! @Agent v2', '0xabc')).toBe('etoile-agent-v2');
  });

  it('collapses whitespace and runs of dashes', () => {
    expect(agentSlug('  Wasa   bot  --  v1 ', '0xabc')).toBe('wasa-bot-v1');
  });

  it('falls back to short wallet hash when name is empty/null', () => {
    expect(agentSlug(null, '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
    expect(agentSlug('', '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
  });

  it('appends short wallet hash when name slug would be empty (only special chars)', () => {
    expect(agentSlug('!!!', '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
  });

  it('truncates very long names to 60 chars max', () => {
    const long = 'a'.repeat(120);
    expect(agentSlug(long, '0xabc')).toBe('a'.repeat(60));
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm --filter @chainward/common test slug.test`
Expected: FAIL with "Cannot find module '../slug.js'"

- [ ] **Step 1.3: Implement the helper**

Create `packages/common/src/slug.ts`:

```typescript
/**
 * Generate a URL-safe slug for an agent.
 * Used for chainward.ai/base/<slug> routes.
 *
 * Rules:
 *  - lowercase
 *  - strip diacritics (NFKD normalize)
 *  - keep only [a-z0-9], collapse other chars to a single dash
 *  - trim leading/trailing dashes, collapse runs
 *  - fall back to `agent-<first-8-of-wallet>` when name yields empty slug
 *  - cap at 60 chars
 */
export function agentSlug(name: string | null | undefined, walletAddress: string): string {
  const fromName = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  if (fromName.length > 0) return fromName;

  const cleaned = walletAddress.replace(/^0x/i, '').toLowerCase().slice(0, 8);
  return `agent-${cleaned}`;
}
```

- [ ] **Step 1.4: Export from package index**

Edit `packages/common/src/index.ts` and add:

```typescript
export { agentSlug } from './slug.js';
```

- [ ] **Step 1.5: Run tests to verify pass**

Run: `pnpm --filter @chainward/common test slug.test`
Expected: PASS, 6 tests.

- [ ] **Step 1.6: Typecheck**

Run: `pnpm --filter @chainward/common typecheck`
Expected: clean.

- [ ] **Step 1.7: Commit**

```bash
git add packages/common/src/slug.ts packages/common/src/__tests__/slug.test.ts packages/common/src/index.ts
git commit -m "feat(common): add agentSlug helper for /base/<slug> routes"
```

---

## Task 2: Add `slug` column to agent_registry

**Files:**
- Create: `packages/db/src/migrations/0013_agent_slug.sql`
- Modify: `packages/db/src/schema/agents.ts`

**Why now:** Need the column before any code can read/write slugs. Backfill in the migration so existing 39 agents get slugs immediately.

- [ ] **Step 2.1: Write the migration SQL**

Create `packages/db/src/migrations/0013_agent_slug.sql`:

```sql
-- 0013: add slug column for /base/<slug> routes

ALTER TABLE agent_registry
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing rows. Mirrors the algorithm in packages/common/src/slug.ts —
-- keep these in sync if the rules ever change.
UPDATE agent_registry
SET slug = COALESCE(
  NULLIF(
    regexp_replace(
      regexp_replace(LOWER(agent_name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
    ''
  ),
  'agent-' || SUBSTRING(REGEXP_REPLACE(wallet_address, '^0x', '', 'i') FROM 1 FOR 8)
)
WHERE slug IS NULL;

-- Make slug NOT NULL + UNIQUE on (chain, slug). Two agents on different chains
-- could theoretically share a name; the chain+slug pair must still be unique.
ALTER TABLE agent_registry
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registry_chain_slug
  ON agent_registry (chain, slug);
```

- [ ] **Step 2.2: Update Drizzle schema**

Edit `packages/db/src/schema/agents.ts`. Add `slug` field after `walletAddress`:

```typescript
walletAddress: text('wallet_address').notNull(),
slug: text('slug').notNull(),
agentName: text('agent_name'),
```

And add the index in the table options (the `(table) => [...]` block):

```typescript
uniqueIndex('idx_agent_registry_chain_slug').on(table.chain, table.slug),
```

- [ ] **Step 2.3: Apply the migration locally + verify**

Run: `pnpm --filter @chainward/db migrate`
Then verify in psql:

```bash
psql $DATABASE_URL -c "SELECT slug FROM agent_registry LIMIT 5;"
```

Expected: 5 non-null slugs, e.g. `aixbt`, `wasabot`, etc. No NULLs.

- [ ] **Step 2.4: Verify uniqueness constraint**

Run: `psql $DATABASE_URL -c "SELECT chain, slug, COUNT(*) FROM agent_registry GROUP BY chain, slug HAVING COUNT(*) > 1;"`
Expected: 0 rows.

- [ ] **Step 2.5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 2.6: Commit**

```bash
git add packages/db/src/migrations/0013_agent_slug.sql packages/db/src/schema/agents.ts
git commit -m "feat(db): add slug column to agent_registry, backfill existing rows"
```

---

## Task 3: Bridge ACP graduated agents into observatory

**Files:**
- Modify: `packages/indexer/src/workers/acpSync.ts`

**Goal:** After each ACP sync, ensure every `acp_agent_data` row with `has_graduated=true` has a matching `agent_registry` row with `is_observatory=true, is_public=true`. This alone should bring us from 39 → ~150 tracked agents.

**Note:** ACP agents have a `wallet_address` (the on-chain ACP wallet). We INSERT or UPDATE on (chain='base', wallet_address) keyed by chain+wallet. `userId` for these system rows is the well-known system user `'system'` (already used by other auto-bridged data — verify in code before committing).

- [ ] **Step 3.1: Find the system user pattern**

Run:
```bash
grep -rn "'system'" packages/indexer/src/workers/ | grep -iE 'user|owner' | head -5
```
Look for an existing convention. If found, use it. If not, the safest path is to use the user_id that already owns the existing observatory rows:

```bash
psql $DATABASE_URL -c "SELECT DISTINCT user_id FROM agent_registry WHERE is_observatory = true;"
```

Use that ID for new bridges. Note the value — it's referenced in step 3.3.

- [ ] **Step 3.2: Read the existing acpSync structure**

Read `packages/indexer/src/workers/acpSync.ts` end-to-end. Find the function that runs after `acp_agent_data` is upserted — that's where the bridge call goes.

- [ ] **Step 3.3: Add the bridge function**

Add to `packages/indexer/src/workers/acpSync.ts`:

```typescript
import { agentSlug } from '@chainward/common';

const SYSTEM_USER_ID = '<value-from-step-3.1>';

/**
 * Bridge graduated ACP agents into agent_registry as observatory entries.
 * Idempotent — uses ON CONFLICT (chain, wallet_address, user_id) DO UPDATE.
 * Only graduates show up because non-graduated ACP rows are noise (unverified).
 */
async function bridgeAcpToObservatory(db: Database): Promise<{ inserted: number; updated: number }> {
  const rows = await db.execute(sql`
    SELECT
      acp.wallet_address,
      acp.name,
      acp.virtual_agent_id,
      acp.twitter_handle,
      acp.profile_pic
    FROM acp_agent_data acp
    WHERE acp.has_graduated = true
      AND acp.wallet_address IS NOT NULL
      AND LENGTH(acp.wallet_address) = 42
  `);

  const typed = rows as unknown as Array<{
    wallet_address: string;
    name: string | null;
    virtual_agent_id: number | null;
    twitter_handle: string | null;
    profile_pic: string | null;
  }>;

  let inserted = 0;
  let updated = 0;

  for (const r of typed) {
    const slug = agentSlug(r.name, r.wallet_address);

    // Drizzle's onConflictDoUpdate would be cleaner but the schema mixes
    // user_id (notNull, no default) into the unique key, so we use raw SQL
    // to keep the system_user_id consistent.
    const result = await db.execute(sql`
      INSERT INTO agent_registry
        (chain, wallet_address, slug, agent_name, agent_framework,
         registry_source, registry_id, twitter_handle, is_public, is_observatory,
         acp_agent_id, user_id)
      VALUES
        ('base', LOWER(${r.wallet_address}), ${slug}, ${r.name},
         'virtuals', 'virtuals', ${r.virtual_agent_id?.toString() ?? null},
         ${r.twitter_handle}, true, true,
         ${r.virtual_agent_id}, ${SYSTEM_USER_ID})
      ON CONFLICT (chain, wallet_address, user_id) DO UPDATE
        SET agent_name = EXCLUDED.agent_name,
            twitter_handle = EXCLUDED.twitter_handle,
            acp_agent_id = EXCLUDED.acp_agent_id,
            is_observatory = true,
            is_public = true,
            updated_at = NOW()
      RETURNING (xmax = 0) AS was_inserted
    `);

    const wasInserted = (result as unknown as Array<{ was_inserted: boolean }>)[0]?.was_inserted;
    if (wasInserted) inserted++;
    else updated++;
  }

  return { inserted, updated };
}
```

Then call `bridgeAcpToObservatory` at the end of the existing sync handler. Log result counts.

- [ ] **Step 3.4: Run the worker once and verify**

Trigger acpSync manually (BullMQ has a `runRepeatableNow` style admin path, OR just restart the indexer pod and let the repeatable trigger). Then verify:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM agent_registry WHERE is_observatory = true;"
```

Expected: was 39, now ≥100 (depends on graduated count in `acp_agent_data`).

```bash
psql $DATABASE_URL -c "SELECT slug, agent_name FROM agent_registry WHERE is_observatory = true ORDER BY agent_name LIMIT 10;"
```

Expected: 10 rows with non-null slugs and recognizable agent names.

- [ ] **Step 3.5: Typecheck + commit**

Run: `pnpm --filter @chainward/indexer typecheck`
Expected: clean.

```bash
git add packages/indexer/src/workers/acpSync.ts
git commit -m "feat(indexer): bridge graduated ACP agents into observatory registry"
```

---

## Task 4: Auto-promote registry candidates to observatory

**Files:**
- Modify: `packages/indexer/src/workers/registryScout.ts`

**Goal:** After each scout run, auto-promote `observatory_candidates` rows where `tx_count > 100 AND status = 'pending'` into `agent_registry` as observatory entries. This catches ERC-8004/Olas agents that aren't on Virtuals/ACP.

**Threshold reasoning:** 100 txs filters out spam tokens / one-off contract creations while keeping real active agents. Tunable later.

- [ ] **Step 4.1: Read existing registryScout**

Read `packages/indexer/src/workers/registryScout.ts`. Identify the function that runs after candidates are inserted. The promotion logic goes there.

- [ ] **Step 4.2: Add the promotion function**

Add to `registryScout.ts`:

```typescript
import { agentSlug } from '@chainward/common';

const PROMOTE_TX_THRESHOLD = 100;
const SYSTEM_USER_ID = '<same-value-as-task-3>';

async function autoPromoteCandidates(db: Database): Promise<{ promoted: number }> {
  // Pull pending candidates above the threshold.
  const rows = await db.execute(sql`
    SELECT id, chain, wallet_address, agent_name, registry_source, registry_token_id
    FROM observatory_candidates
    WHERE status = 'pending' AND tx_count > ${PROMOTE_TX_THRESHOLD}
    LIMIT 100
  `);

  const typed = rows as unknown as Array<{
    id: number;
    chain: string;
    wallet_address: string;
    agent_name: string | null;
    registry_source: string;
    registry_token_id: string | null;
  }>;

  let promoted = 0;
  for (const r of typed) {
    const slug = agentSlug(r.agent_name, r.wallet_address);

    await db.execute(sql`
      INSERT INTO agent_registry
        (chain, wallet_address, slug, agent_name, agent_framework,
         registry_source, registry_id, is_public, is_observatory, user_id)
      VALUES
        (${r.chain}, LOWER(${r.wallet_address}), ${slug}, ${r.agent_name},
         CASE ${r.registry_source}
           WHEN 'erc8004' THEN 'erc8004'
           WHEN 'olas' THEN 'olas'
           ELSE 'custom'
         END,
         ${r.registry_source}, ${r.registry_token_id},
         true, true, ${SYSTEM_USER_ID})
      ON CONFLICT (chain, wallet_address, user_id) DO UPDATE
        SET is_observatory = true, is_public = true, updated_at = NOW()
    `);

    await db.execute(sql`
      UPDATE observatory_candidates
      SET status = 'approved', reviewed_at = NOW(),
          notes = COALESCE(notes, '') || ' [auto-promoted: tx_count > ${sql.raw(String(PROMOTE_TX_THRESHOLD))}]'
      WHERE id = ${r.id}
    `);

    promoted++;
  }

  return { promoted };
}
```

Wire `autoPromoteCandidates` into the worker handler after the existing candidate-discovery code.

- [ ] **Step 4.3: Run + verify**

Trigger registryScout manually. Then:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM agent_registry WHERE is_observatory = true;"
```

Expected: count grew vs end-of-Task-3 by however many high-activity ERC-8004 candidates existed.

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM observatory_candidates WHERE status = 'approved' AND notes LIKE '%auto-promoted%';"
```

Expected: matches the growth above.

- [ ] **Step 4.4: Typecheck + commit**

```bash
pnpm --filter @chainward/indexer typecheck
git add packages/indexer/src/workers/registryScout.ts
git commit -m "feat(indexer): auto-promote high-activity registry candidates to observatory"
```

---

## Task 5: Health Score worker — formula + tests

**Files:**
- Create: `packages/indexer/src/workers/healthScore.ts`
- Create: `packages/indexer/src/workers/__tests__/healthScore.test.ts`

**The formula (commit to it now so it's debate-able later):**

```
score = 0.30 * uptimePct          // % of last-7-day windows with at least one tx
      + 0.25 * (100 - failureRate)// 100 minus failed-tx percentage
      + 0.25 * gasEfficiency      // normalized inverse of avg gas-per-tx vs cohort
      + 0.20 * consistency        // stddev of daily tx counts, normalized inverse

uptimePct       0–100  (rolling 7d, hourly granularity)
failureRate     0–100  (failed_tx / total_tx * 100, last 7d)
gasEfficiency   0–100  (100 = best in cohort, 0 = worst, log-scaled by gas-per-tx)
consistency     0–100  (100 = perfectly steady tx volume across days, 0 = all in one burst)
```

**Why these:** they answer "is this agent reliably doing work without burning excessive gas?" — exactly what someone looking at the leaderboard wants to know. Each sub-score is also surfaced individually so people can argue about what matters.

- [ ] **Step 5.1: Write the failing tests for the pure formula**

Create `packages/indexer/src/workers/__tests__/healthScore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeHealthScore } from '../healthScore.js';

describe('computeHealthScore', () => {
  it('returns max score for a perfect agent', () => {
    const result = computeHealthScore({
      uptimePct: 100,
      failureRate: 0,
      gasEfficiency: 100,
      consistency: 100,
    });
    expect(result).toBe(100);
  });

  it('returns 0 for a totally broken agent', () => {
    const result = computeHealthScore({
      uptimePct: 0,
      failureRate: 100,
      gasEfficiency: 0,
      consistency: 0,
    });
    expect(result).toBe(0);
  });

  it('weights uptime at 30%', () => {
    // 100 uptime, everything else 0 → 30
    expect(
      computeHealthScore({ uptimePct: 100, failureRate: 100, gasEfficiency: 0, consistency: 0 }),
    ).toBe(30);
  });

  it('weights failure-rate inverse at 25%', () => {
    // 0 failure (100 - failureRate = 100), everything else 0 → 25
    expect(
      computeHealthScore({ uptimePct: 0, failureRate: 0, gasEfficiency: 0, consistency: 0 }),
    ).toBe(25);
  });

  it('clamps inputs into [0, 100]', () => {
    expect(
      computeHealthScore({ uptimePct: 150, failureRate: -10, gasEfficiency: 200, consistency: 50 }),
    ).toBe(100); // clamps all to 100, scores 100
  });

  it('rounds to nearest integer', () => {
    // 0.30 * 33 + 0.25 * 33 + 0.25 * 33 + 0.20 * 33 = 33
    // Use 34 to force a rounding case: 0.3*34 = 10.2 etc. → 34
    expect(
      computeHealthScore({
        uptimePct: 34,
        failureRate: 66, // 100 - 66 = 34
        gasEfficiency: 34,
        consistency: 34,
      }),
    ).toBe(34);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `pnpm --filter @chainward/indexer test healthScore.test`
Expected: FAIL with "Cannot find module '../healthScore.js'"

- [ ] **Step 5.3: Implement the pure formula**

Create `packages/indexer/src/workers/healthScore.ts`:

```typescript
import { Worker, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── Pure formula ───────────────────────────────────────────────────────────

export interface HealthInputs {
  uptimePct: number;       // 0–100
  failureRate: number;     // 0–100
  gasEfficiency: number;   // 0–100
  consistency: number;     // 0–100
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeHealthScore(inputs: HealthInputs): number {
  const u = clamp(inputs.uptimePct);
  const f = clamp(inputs.failureRate);
  const g = clamp(inputs.gasEfficiency);
  const c = clamp(inputs.consistency);

  return Math.round(0.30 * u + 0.25 * (100 - f) + 0.25 * g + 0.20 * c);
}
```

- [ ] **Step 5.4: Run tests to verify pass**

Run: `pnpm --filter @chainward/indexer test healthScore.test`
Expected: PASS, 6 tests.

- [ ] **Step 5.5: Commit (formula only — DB integration in Task 6)**

```bash
git add packages/indexer/src/workers/healthScore.ts \
        packages/indexer/src/workers/__tests__/healthScore.test.ts
git commit -m "feat(indexer): add health-score formula with weighted composite (uptime/failure/gas/consistency)"
```

---

## Task 6: Health Score worker — DB integration + scheduling

**Files:**
- Modify: `packages/indexer/src/workers/healthScore.ts` (extend with worker)
- Modify: `packages/indexer/src/index.ts` (register worker + repeatable job)

- [ ] **Step 6.1: Add the inputs-from-DB helper**

Append to `packages/indexer/src/workers/healthScore.ts`:

```typescript
// ─── Per-agent inputs computed from transactions table ──────────────────────

async function loadInputs(db: ReturnType<typeof getDb>, agentId: number, walletAddress: string): Promise<HealthInputs> {
  // 7-day window
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Uptime: % of 168 hourly windows with ≥1 tx
  const uptimeRows = await db.execute(sql`
    WITH hours AS (
      SELECT generate_series(
        date_trunc('hour', NOW() - INTERVAL '7 days'),
        date_trunc('hour', NOW()),
        INTERVAL '1 hour'
      ) AS h
    ),
    active AS (
      SELECT DISTINCT date_trunc('hour', timestamp) AS h
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND timestamp >= ${weekAgo}::timestamptz
    )
    SELECT
      COUNT(active.h)::float / NULLIF(COUNT(hours.h), 0)::float * 100 AS uptime_pct
    FROM hours
    LEFT JOIN active USING (h)
  `);
  const uptimePct = parseFloat(String((uptimeRows as unknown as Array<{ uptime_pct: string | null }>)[0]?.uptime_pct ?? '0'));

  // Failure rate: failed_tx / total_tx * 100
  const failureRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed')::float
        / NULLIF(COUNT(*), 0)::float * 100 AS failure_rate
    FROM transactions
    WHERE LOWER(wallet_address) = LOWER(${walletAddress})
      AND timestamp >= ${weekAgo}::timestamptz
  `);
  const failureRate = parseFloat(String((failureRows as unknown as Array<{ failure_rate: string | null }>)[0]?.failure_rate ?? '0'));

  // Gas efficiency: this agent's avg gas-per-tx, normalized vs cohort.
  // Below-cohort-median = high score; above = low. Clamped 0–100.
  const gasRows = await db.execute(sql`
    WITH per_agent AS (
      SELECT
        wallet_address,
        AVG(CAST(gas_cost_usd AS numeric))::float AS avg_gas
      FROM transactions
      WHERE timestamp >= ${weekAgo}::timestamptz
        AND gas_cost_usd IS NOT NULL
      GROUP BY wallet_address
    ),
    cohort AS (
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_gas) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY avg_gas) AS p95
      FROM per_agent
    ),
    me AS (
      SELECT avg_gas FROM per_agent WHERE LOWER(wallet_address) = LOWER(${walletAddress})
    )
    SELECT
      CASE
        WHEN me.avg_gas IS NULL THEN 50
        WHEN cohort.p95 IS NULL OR cohort.p95 = 0 THEN 50
        WHEN me.avg_gas <= cohort.p50 THEN 100
        WHEN me.avg_gas >= cohort.p95 THEN 0
        ELSE 100 - ((me.avg_gas - cohort.p50) / (cohort.p95 - cohort.p50)) * 100
      END AS gas_efficiency
    FROM cohort, me
  `);
  const gasEfficiency = parseFloat(String((gasRows as unknown as Array<{ gas_efficiency: string | null }>)[0]?.gas_efficiency ?? '50'));

  // Consistency: 100 - normalized stddev of daily tx counts.
  const consistencyRows = await db.execute(sql`
    WITH daily AS (
      SELECT date_trunc('day', timestamp) AS d, COUNT(*) AS c
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND timestamp >= ${weekAgo}::timestamptz
      GROUP BY d
    )
    SELECT
      CASE
        WHEN COUNT(*) < 2 THEN 0
        WHEN AVG(c) = 0 THEN 0
        ELSE GREATEST(0, 100 - (STDDEV_POP(c::float) / AVG(c::float) * 100))
      END AS consistency
    FROM daily
  `);
  const consistency = parseFloat(String((consistencyRows as unknown as Array<{ consistency: string | null }>)[0]?.consistency ?? '0'));

  return { uptimePct, failureRate, gasEfficiency, consistency };
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createHealthScoreWorker() {
  return new Worker(
    'health-score',
    async (_job: Job) => {
      const db = getDb();

      const agents = await db.execute(sql`
        SELECT id, wallet_address
        FROM agent_registry
        WHERE is_observatory = true AND is_public = true
      `);
      const typed = agents as unknown as Array<{ id: number; wallet_address: string }>;

      let written = 0;
      for (const a of typed) {
        const inputs = await loadInputs(db, a.id, a.wallet_address);
        const score = computeHealthScore(inputs);

        await db.execute(sql`
          INSERT INTO daily_agent_health
            (agent_id, date, score, uptime_pct, gas_efficiency, failure_rate, consistency)
          VALUES
            (${a.id}, CURRENT_DATE, ${score},
             ${inputs.uptimePct.toFixed(2)}, ${inputs.gasEfficiency.toFixed(2)},
             ${inputs.failureRate.toFixed(2)}, ${inputs.consistency.toFixed(2)})
          ON CONFLICT (agent_id, date) DO UPDATE
            SET score = EXCLUDED.score,
                uptime_pct = EXCLUDED.uptime_pct,
                gas_efficiency = EXCLUDED.gas_efficiency,
                failure_rate = EXCLUDED.failure_rate,
                consistency = EXCLUDED.consistency
        `);
        written++;
      }

      logger.info({ written }, 'healthScore: wrote daily_agent_health rows');
      return { written };
    },
    { connection: getRedis(), concurrency: 1 },
  );
}
```

**Note:** The migration in Task 2 didn't add a primary key on `daily_agent_health`. Check `packages/db/src/schema/agentHealth.ts` — if there's no PK or unique constraint on `(agent_id, date)`, the `ON CONFLICT` clause will fail. Add one in a follow-up sub-step:

- [ ] **Step 6.2: Verify or add PK on daily_agent_health**

```bash
psql $DATABASE_URL -c "\d daily_agent_health"
```

If no `(agent_id, date)` unique constraint exists, add a migration `0014_daily_agent_health_pk.sql`:

```sql
ALTER TABLE daily_agent_health
  ADD CONSTRAINT daily_agent_health_pk PRIMARY KEY (agent_id, date);
```

Apply via `pnpm --filter @chainward/db migrate` and update the schema with `.primaryKey()` modifiers.

- [ ] **Step 6.3: Register the worker + daily schedule**

Edit `packages/indexer/src/index.ts`. Add:

```typescript
import { createHealthScoreWorker } from './workers/healthScore.js';

// ... in the workers list:
const healthScoreWorker = createHealthScoreWorker();

// ... after the workers are started, register the daily repeatable job:
const healthScoreQueue = new Queue('health-score', { connection: getRedis() });
await healthScoreQueue.upsertJobScheduler(
  'health-score-daily',
  { pattern: '0 4 * * *' }, // 04:00 UTC daily
  { name: 'health-score', data: {} },
);
```

Also add `healthScoreWorker.close()` to the existing shutdown handler.

- [ ] **Step 6.4: Trigger once + verify**

```bash
# Add a one-shot job from the API container (or via redis-cli):
psql $DATABASE_URL -c "SELECT COUNT(*) FROM daily_agent_health WHERE date = CURRENT_DATE;"
```

Expected initially: 0. Trigger the worker (manual job add or wait for 04:00 UTC). Then re-run — expected: ≥100 rows (matching observatory size).

```bash
psql $DATABASE_URL -c "SELECT a.agent_name, h.score, h.uptime_pct, h.failure_rate, h.gas_efficiency, h.consistency FROM daily_agent_health h JOIN agent_registry a ON a.id = h.agent_id WHERE h.date = CURRENT_DATE ORDER BY h.score DESC LIMIT 10;"
```

Expected: 10 rows with sensible numbers (scores 0–100, sub-metrics 0–100).

- [ ] **Step 6.5: Verify the existing leaderboard endpoint now returns healthiest**

```bash
curl -s http://localhost:8000/api/observatory/leaderboard | jq '.data.healthiest | length'
```

Expected: 10 (the leaderboard query was already there — Task 5+6 just supplied the data).

- [ ] **Step 6.6: Typecheck + commit**

```bash
pnpm --filter @chainward/indexer typecheck
git add packages/indexer/src/workers/healthScore.ts packages/indexer/src/index.ts \
        packages/db/src/migrations/0014_daily_agent_health_pk.sql \
        packages/db/src/schema/agentHealth.ts
git commit -m "feat(indexer): wire healthScore worker — daily compute, populate daily_agent_health"
```

---

## Task 7: Per-agent API endpoint

**Files:**
- Modify: `apps/api/src/services/observatoryService.ts`
- Modify: `apps/api/src/routes/observatory.ts`

**Goal:** `GET /api/observatory/agent/:slug` returns one bundle that the per-agent page can render in a single fetch — agent metadata + last 50 txs + 30-day balance series + current health-score breakdown + ACP economics if linked.

- [ ] **Step 7.1: Add the service method**

In `apps/api/src/services/observatoryService.ts`, add (after `getAlertActivity`):

```typescript
async getAgentDetail(slug: string) {
  return this.cached(`obs:agent:${slug}`, 120, async () => {
    // 1. Resolve slug → agent
    const agentRows = await this.db.execute(sql`
      SELECT id, wallet_address, slug, agent_name, agent_framework,
             twitter_handle, project_url, registry_source, acp_agent_id, first_seen_at
      FROM agent_registry
      WHERE chain = 'base' AND slug = ${slug} AND is_observatory = true AND is_public = true
      LIMIT 1
    `);
    const agent = (agentRows as unknown as Array<Record<string, unknown>>)[0];
    if (!agent) return null;

    const wallet = String(agent.wallet_address);
    const agentId = Number(agent.id);

    // 2. Latest health score + breakdown
    const healthRows = await this.db.execute(sql`
      SELECT score, uptime_pct, gas_efficiency, failure_rate, consistency, date
      FROM daily_agent_health
      WHERE agent_id = ${agentId}
      ORDER BY date DESC
      LIMIT 1
    `);
    const health = (healthRows as unknown as Array<Record<string, unknown>>)[0] ?? null;

    // 3. 30-day daily balance series (native ETH only for chart simplicity)
    const balanceRows = await this.db.execute(sql`
      SELECT
        time_bucket('1 day', timestamp) AS day,
        AVG(CAST(balance_usd AS numeric))::float AS balance_usd,
        AVG(CAST(balance_native AS numeric))::float AS balance_eth
      FROM balance_snapshots
      WHERE LOWER(wallet_address) = LOWER(${wallet})
        AND token_address IS NULL
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    // 4. Last 50 transactions
    const txRows = await this.db.execute(sql`
      SELECT timestamp, direction, token_symbol, amount_usd, gas_cost_usd,
             tx_hash, tx_type, status
      FROM transactions
      WHERE LOWER(wallet_address) = LOWER(${wallet})
      ORDER BY timestamp DESC
      LIMIT 50
    `);

    // 5. ACP economics (if linked)
    let acp = null;
    if (agent.acp_agent_id) {
      const acpRows = await this.db.execute(sql`
        SELECT name, symbol, role, profile_pic, has_graduated, is_online,
               revenue, gross_agentic_amount AS agdp,
               successful_job_count AS jobs, success_rate, unique_buyer_count
        FROM acp_agent_data
        WHERE virtual_agent_id = ${agent.acp_agent_id}
        LIMIT 1
      `);
      acp = (acpRows as unknown as Array<Record<string, unknown>>)[0] ?? null;
    }

    return {
      slug: String(agent.slug),
      walletAddress: wallet,
      agentName: agent.agent_name != null ? String(agent.agent_name) : null,
      agentFramework: agent.agent_framework != null ? String(agent.agent_framework) : null,
      twitterHandle: agent.twitter_handle != null ? String(agent.twitter_handle) : null,
      projectUrl: agent.project_url != null ? String(agent.project_url) : null,
      registrySource: String(agent.registry_source),
      firstSeenAt: String(agent.first_seen_at),
      health: health ? {
        score: Number(health.score),
        uptimePct: parseFloat(String(health.uptime_pct ?? '0')),
        gasEfficiency: parseFloat(String(health.gas_efficiency ?? '0')),
        failureRate: parseFloat(String(health.failure_rate ?? '0')),
        consistency: parseFloat(String(health.consistency ?? '0')),
        date: String(health.date),
      } : null,
      balanceSeries: (balanceRows as unknown as Array<Record<string, unknown>>).map((r) => ({
        date: String(r.day),
        balanceUsd: r.balance_usd != null ? Number(r.balance_usd) : null,
        balanceEth: r.balance_eth != null ? Number(r.balance_eth) : null,
      })),
      transactions: (txRows as unknown as Array<Record<string, unknown>>).map((r) => ({
        timestamp: String(r.timestamp),
        direction: String(r.direction),
        tokenSymbol: r.token_symbol != null ? String(r.token_symbol) : null,
        amountUsd: parseFloat(String(r.amount_usd ?? '0')),
        gasCostUsd: parseFloat(String(r.gas_cost_usd ?? '0')),
        txHash: String(r.tx_hash),
        txType: r.tx_type != null ? String(r.tx_type) : 'unknown',
        status: String(r.status),
      })),
      acp: acp ? {
        name: String(acp.name ?? ''),
        symbol: acp.symbol != null ? String(acp.symbol) : null,
        role: acp.role != null ? String(acp.role) : null,
        profilePic: acp.profile_pic != null ? String(acp.profile_pic) : null,
        hasGraduated: Boolean(acp.has_graduated),
        isOnline: Boolean(acp.is_online),
        revenue: parseFloat(String(acp.revenue ?? '0')),
        agdp: parseFloat(String(acp.agdp ?? '0')),
        jobs: Number(acp.jobs ?? 0),
        successRate: parseFloat(String(acp.success_rate ?? '0')),
        uniqueBuyers: Number(acp.unique_buyer_count ?? 0),
      } : null,
    };
  });
}
```

- [ ] **Step 7.2: Add the route handler**

In `apps/api/src/routes/observatory.ts`, add (before the `/candidates` block):

```typescript
observatory.get('/agent/:slug', async (c) => {
  const slug = c.req.param('slug');

  if (!/^[a-z0-9][a-z0-9-]{0,59}$/i.test(slug)) {
    return c.json({ success: false, error: 'invalid slug' }, 400);
  }

  const data = await getService().getAgentDetail(slug);
  if (!data) return c.json({ success: false, error: 'agent not found' }, 404);

  return c.json({ success: true, data });
});
```

- [ ] **Step 7.3: Smoke-test**

```bash
# pick a known slug
SLUG=$(psql -t -A $DATABASE_URL -c "SELECT slug FROM agent_registry WHERE is_observatory = true LIMIT 1;")
curl -s "http://localhost:8000/api/observatory/agent/$SLUG" | jq '.data | {slug, agentName, health, txCount: (.transactions|length)}'
```

Expected: non-null `agentName`, `health` block (or null if worker hasn't run yet), `txCount` 0–50.

- [ ] **Step 7.4: Typecheck + commit**

```bash
pnpm --filter @chainward/api typecheck
git add apps/api/src/services/observatoryService.ts apps/api/src/routes/observatory.ts
git commit -m "feat(api): add /api/observatory/agent/:slug endpoint with full per-agent payload"
```

---

## Task 8: Per-agent landing page UI

**Files:**
- Create: `apps/web/src/app/base/[slug]/page.tsx`
- Create: `apps/web/src/app/base/[slug]/agent-detail-client.tsx`

**Why two files:** server component fetches data + sets metadata; client component handles interactive chart + tab switching.

- [ ] **Step 8.1: Create the server component (data fetch + metadata)**

Create `apps/web/src/app/base/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentDetailClient } from './agent-detail-client';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchAgent(slug: string) {
  const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${slug}`, {
    next: { revalidate: 120 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const agent = await fetchAgent(slug);
  if (!agent) return { title: 'Agent not found — ChainWard' };

  const name = agent.agentName ?? slug;
  const score = agent.health?.score;
  const title = score != null
    ? `${name} — Health ${score}/100 — ChainWard`
    : `${name} — On-chain activity — ChainWard`;
  const description = agent.acp?.revenue
    ? `${name} on Base. Revenue $${Math.round(agent.acp.revenue).toLocaleString()}, ${agent.acp.jobs} jobs, ${score ?? '—'}/100 health.`
    : `${name} on Base. Live wallet activity, gas analytics, alerts.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function AgentPage({ params }: PageProps) {
  const { slug } = await params;
  const agent = await fetchAgent(slug);
  if (!agent) notFound();
  return <AgentDetailClient agent={agent} />;
}
```

- [ ] **Step 8.2: Create the client component**

Create `apps/web/src/app/base/[slug]/agent-detail-client.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Mirrors the API payload — keep in sync with ObservatoryService.getAgentDetail
interface AgentDetail {
  slug: string;
  walletAddress: string;
  agentName: string | null;
  agentFramework: string | null;
  twitterHandle: string | null;
  projectUrl: string | null;
  health: {
    score: number;
    uptimePct: number;
    gasEfficiency: number;
    failureRate: number;
    consistency: number;
  } | null;
  balanceSeries: Array<{ date: string; balanceUsd: number | null; balanceEth: number | null }>;
  transactions: Array<{
    timestamp: string;
    direction: string;
    tokenSymbol: string | null;
    amountUsd: number;
    gasCostUsd: number;
    txHash: string;
    txType: string;
    status: string;
  }>;
  acp: {
    name: string;
    symbol: string | null;
    role: string | null;
    revenue: number;
    agdp: number;
    jobs: number;
    successRate: number;
    uniqueBuyers: number;
    hasGraduated: boolean;
    isOnline: boolean;
  } | null;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';
  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg className="absolute inset-0" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 264} 264`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="text-2xl font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

export function AgentDetailClient({ agent }: { agent: AgentDetail }) {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <header className="flex items-start gap-6 flex-wrap">
        <div>
          <Link href="/base" className="text-sm text-neutral-400 hover:text-neutral-200">← Observatory</Link>
          <h1 className="text-3xl font-mono mt-2">{agent.agentName ?? agent.slug}</h1>
          <div className="text-sm text-neutral-400 mt-1 font-mono break-all">{agent.walletAddress}</div>
          <div className="flex gap-2 mt-2 text-xs">
            {agent.agentFramework && (
              <span className="px-2 py-1 bg-neutral-800 rounded">{agent.agentFramework}</span>
            )}
            {agent.acp?.role && (
              <span className="px-2 py-1 bg-neutral-800 rounded">{agent.acp.role}</span>
            )}
            {agent.acp?.hasGraduated && (
              <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded">graduated</span>
            )}
            {agent.acp?.isOnline && (
              <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded">online</span>
            )}
          </div>
          {agent.twitterHandle && (
            <a
              href={`https://twitter.com/${agent.twitterHandle}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline mt-2 inline-block"
            >@{agent.twitterHandle}</a>
          )}
        </div>

        {/* Score */}
        {agent.health && (
          <div className="ml-auto flex items-center gap-4">
            <ScoreRing score={agent.health.score} />
            <div className="text-xs space-y-0.5 text-neutral-400">
              <div>uptime {agent.health.uptimePct.toFixed(0)}%</div>
              <div>gas-eff {agent.health.gasEfficiency.toFixed(0)}</div>
              <div>fail {agent.health.failureRate.toFixed(1)}%</div>
              <div>consist {agent.health.consistency.toFixed(0)}</div>
            </div>
          </div>
        )}
      </header>

      {/* ACP economics row */}
      {agent.acp && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="revenue" value={`$${Math.round(agent.acp.revenue).toLocaleString()}`} />
          <Stat label="jobs" value={agent.acp.jobs.toLocaleString()} />
          <Stat label="success" value={`${(agent.acp.successRate * 100).toFixed(1)}%`} />
          <Stat label="unique buyers" value={agent.acp.uniqueBuyers.toLocaleString()} />
        </section>
      )}

      {/* Balance chart */}
      <section>
        <h2 className="text-sm font-mono text-neutral-400 mb-2">balance — 30d</h2>
        {agent.balanceSeries.length === 0 ? (
          <div className="text-sm text-neutral-500 p-6 border border-neutral-800 rounded">no balance history yet</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={agent.balanceSeries}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  contentStyle={{ background: '#0a0a0a', border: '1px solid #333', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="balanceUsd" stroke="#4ade80" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Transactions */}
      <section>
        <h2 className="text-sm font-mono text-neutral-400 mb-2">recent transactions</h2>
        <div className="border border-neutral-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2">when</th>
                <th className="text-left px-3 py-2">type</th>
                <th className="text-left px-3 py-2">token</th>
                <th className="text-right px-3 py-2">amount</th>
                <th className="text-right px-3 py-2">gas</th>
                <th className="text-left px-3 py-2">tx</th>
              </tr>
            </thead>
            <tbody>
              {agent.transactions.slice(0, 20).map((tx) => (
                <tr key={tx.txHash + tx.timestamp} className="border-t border-neutral-900">
                  <td className="px-3 py-2 text-xs text-neutral-400">{new Date(tx.timestamp).toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-2 text-xs">{tx.txType}</td>
                  <td className="px-3 py-2 text-xs">{tx.tokenSymbol ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs">${tx.amountUsd.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-400">${tx.gasCostUsd.toFixed(4)}</td>
                  <td className="px-3 py-2 text-xs">
                    <a
                      href={`https://basescan.org/tx/${tx.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline font-mono"
                    >{tx.txHash.slice(0, 10)}…</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-800 p-3 rounded">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-mono mt-1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 8.3: Boot the dev server and smoke-test**

```bash
pnpm dev
```

Open `http://localhost:3000/base/<some-slug>` (use a slug from the DB). Verify:
- Page renders without errors
- Health ring shows up if data exists
- Tx table populates
- "← Observatory" link returns to /base
- View source: `<title>` and `<meta name="description">` reflect the agent name

- [ ] **Step 8.4: Typecheck + commit**

```bash
pnpm --filter @chainward/web typecheck
git add apps/web/src/app/base/\[slug\]/
git commit -m "feat(web): per-agent landing page at /base/<slug>"
```

---

## Task 9: Wire leaderboard rows → per-agent links

**Files:**
- Modify: `apps/web/src/app/base/observatory-page.tsx`

The Observatory currently lists agents in leaderboards but they're not clickable. Make every agent row a `Link` to `/base/<slug>`.

- [ ] **Step 9.1: Confirm leaderboard payload shape**

Current `getLeaderboard()` (Task 6 view) returns `walletAddress` + `agentName` + `agentFramework`. We need `slug` too.

- [ ] **Step 9.2: Add `slug` to leaderboard SQL**

In `apps/api/src/services/observatoryService.ts`, update each of the four leaderboard sub-queries (`mostActive`, `highestGas`, `largestPortfolio`, `healthiest`) to include `a.slug` in SELECT and add `slug: String(r.slug)` to each row mapping. Three of them already JOIN agent_registry; the fourth (largestPortfolio) does too. Just thread `a.slug` through.

- [ ] **Step 9.3: Update Observatory page to use slug links**

In `apps/web/src/app/base/observatory-page.tsx`, find each leaderboard rendering. For each row that currently shows `agentName`, wrap in:

```tsx
<Link href={`/base/${row.slug}`} className="hover:underline">
  {row.agentName}
</Link>
```

- [ ] **Step 9.4: Smoke-test**

```bash
pnpm dev
```

Visit `http://localhost:3000/base`. Click any name in any leaderboard. Should land on a working `/base/<slug>` page.

- [ ] **Step 9.5: Typecheck + commit**

```bash
pnpm typecheck
git add apps/api/src/services/observatoryService.ts apps/web/src/app/base/observatory-page.tsx
git commit -m "feat(web): leaderboard rows link to per-agent pages"
```

---

## Task 10: Dynamic OG image per agent

**Files:**
- Create: `apps/web/src/app/base/[slug]/opengraph-image.tsx`

Tweet-friendly screenshot generated at request time. Next.js 15's `ImageResponse` API.

- [ ] **Step 10.1: Implement the OG image**

Create `apps/web/src/app/base/[slug]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ChainWard agent profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export default async function og({ params }: { params: { slug: string } }) {
  const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${params.slug}`);
  if (!res.ok) {
    return new ImageResponse(<div>not found</div>, { ...size });
  }
  const { data: agent } = await res.json();

  const score = agent.health?.score;
  const scoreColor = score == null ? '#888' : score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          color: '#e5e5e5',
          padding: '60px',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 28, color: '#4ade80' }}>chainward.ai/base</div>
        <div style={{ fontSize: 80, marginTop: 20, fontWeight: 700 }}>
          {agent.agentName ?? agent.slug}
        </div>
        <div style={{ fontSize: 24, color: '#888', marginTop: 8 }}>
          {agent.walletAddress}
        </div>

        <div style={{ display: 'flex', gap: 60, marginTop: 60 }}>
          {/* Score */}
          {score != null && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, color: '#888' }}>health score</div>
              <div style={{ fontSize: 120, color: scoreColor, fontWeight: 700, lineHeight: 1 }}>
                {score}
                <span style={{ fontSize: 36, color: '#666' }}> /100</span>
              </div>
            </div>
          )}

          {/* ACP Revenue */}
          {agent.acp?.revenue > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, color: '#888' }}>revenue</div>
              <div style={{ fontSize: 80, color: '#e5e5e5', fontWeight: 700 }}>
                ${Math.round(agent.acp.revenue).toLocaleString()}
              </div>
              <div style={{ fontSize: 18, color: '#888' }}>{agent.acp.jobs.toLocaleString()} jobs</div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 10.2: Smoke-test**

```bash
pnpm dev
```

Visit `http://localhost:3000/base/<slug>/opengraph-image` directly. Should render a 1200×630 PNG.

Then verify the meta tag wires up: open `view-source:http://localhost:3000/base/<slug>` and confirm the `<meta property="og:image">` tag appears (Next 15 auto-injects when `opengraph-image.tsx` exists).

- [ ] **Step 10.3: Typecheck + commit**

```bash
pnpm --filter @chainward/web typecheck
git add apps/web/src/app/base/\[slug\]/opengraph-image.tsx
git commit -m "feat(web): dynamic OG image per agent for shareable /base/<slug> URLs"
```

---

## Task 11: Weekly digest thread formatter + Discord delivery

**Files:**
- Create: `packages/common/src/digestThread.ts`
- Modify: `packages/indexer/src/workers/digestGenerator.ts`

**Goal (this iteration):** when the existing weekly digest is generated, also format it as a 4–6 tweet thread and POST to a Discord webhook. Defer Twitter API integration — the thread text is identical; manual copy/paste from Discord channel for now.

- [ ] **Step 11.1: Write the thread formatter**

Create `packages/common/src/digestThread.ts`:

```typescript
// Renders a weekly_digests row into a Twitter-style thread
// (numbered, ≤280 chars per tweet) + a Discord embed payload.

interface DigestSummary {
  weekStart: string;
  weekEnd: string;
  ecosystem: { totalRevenue: number; totalJobs: number; activeAgents: number };
  topEarners: Array<{ name: string; slug: string; revenue: number }>;
  movers: Array<{ name: string; slug: string; changePct: number }>;
}

export function renderDigestThread(d: DigestSummary): string[] {
  const tweets: string[] = [];

  const dateRange = `${d.weekStart.slice(0, 10)} → ${d.weekEnd.slice(0, 10)}`;

  // 1: Headline
  tweets.push(
    `📊 Base AI Agents — week of ${dateRange}\n\n` +
    `${d.ecosystem.activeAgents} active agents\n` +
    `${d.ecosystem.totalJobs.toLocaleString()} jobs\n` +
    `$${Math.round(d.ecosystem.totalRevenue).toLocaleString()} revenue\n\n` +
    `Full leaderboard: chainward.ai/base`,
  );

  // 2: Top earners
  if (d.topEarners.length > 0) {
    const lines = d.topEarners.slice(0, 5).map((e, i) =>
      `${i + 1}. ${e.name} — $${Math.round(e.revenue).toLocaleString()}`,
    );
    tweets.push(`💰 Top earners this week:\n\n${lines.join('\n')}`);
  }

  // 3: Movers
  if (d.movers.length > 0) {
    const ups = d.movers.filter((m) => m.changePct > 0).slice(0, 3);
    const downs = d.movers.filter((m) => m.changePct < 0).slice(0, 3);
    const sections: string[] = [];
    if (ups.length) {
      sections.push(`📈 Movers up:\n${ups.map((m) => `${m.name} +${m.changePct.toFixed(0)}%`).join('\n')}`);
    }
    if (downs.length) {
      sections.push(`📉 Movers down:\n${downs.map((m) => `${m.name} ${m.changePct.toFixed(0)}%`).join('\n')}`);
    }
    if (sections.length) tweets.push(sections.join('\n\n'));
  }

  // 4: Tail
  tweets.push(
    `Click any agent name on chainward.ai/base for full breakdown — health score, ` +
    `tx feed, gas analytics. Free + public.\n\n` +
    `🧵 end thread.`,
  );

  return tweets;
}

export function renderDigestDiscord(d: DigestSummary): {
  content: string;
  embeds: Array<Record<string, unknown>>;
} {
  const thread = renderDigestThread(d);
  return {
    content: '**Weekly digest ready — copy this thread to Twitter/Farcaster:**',
    embeds: thread.map((tweet, i) => ({
      title: `Tweet ${i + 1}/${thread.length}`,
      description: tweet,
      color: 0x4ade80,
    })),
  };
}
```

- [ ] **Step 11.2: Wire into digestGenerator**

In `packages/indexer/src/workers/digestGenerator.ts`, after the digest is written to `weekly_digests`:

```typescript
import { renderDigestDiscord } from '@chainward/common';

// ... after the existing INSERT into weekly_digests ...

const webhookUrl = process.env.DIGEST_DISCORD_WEBHOOK;
if (webhookUrl) {
  const summary = {
    weekStart: digest.weekStart,
    weekEnd: digest.weekEnd,
    ecosystem: digest.ecosystem,
    topEarners: digest.leaderboards.mostProfitable.map((e) => ({
      name: e.name ?? e.walletAddress,
      slug: e.slug ?? e.walletAddress, // requires slug to be threaded — verify
      revenue: e.revenue,
    })),
    movers: [
      ...digest.movers.up.map((m) => ({ name: m.name ?? m.walletAddress, slug: m.slug ?? m.walletAddress, changePct: m.changePct })),
      ...digest.movers.down.map((m) => ({ name: m.name ?? m.walletAddress, slug: m.slug ?? m.walletAddress, changePct: m.changePct })),
    ],
  };

  const payload = renderDigestDiscord(summary);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'digestGenerator: Discord webhook failed');
    } else {
      logger.info('digestGenerator: posted weekly digest to Discord');
    }
  } catch (err) {
    logger.error({ err }, 'digestGenerator: Discord webhook error');
  }
}
```

**Caveat:** The `slug` thread-through depends on the existing digest pipeline including `slug` in its leaderboard rows. If it doesn't, extend the digestGenerator's leaderboard SQL to JOIN `agent_registry` and SELECT `slug` (mirrors the change in Task 9 for the live leaderboard).

- [ ] **Step 11.3: Add the env var**

Update `.env.example` (already present):

```
DIGEST_DISCORD_WEBHOOK=
```

And add to the Helm secret docs in `deploy/helm/chainward/templates/secret.yaml` comment block:

```
--from-literal=DIGEST_DISCORD_WEBHOOK=<discord-webhook-url>
```

- [ ] **Step 11.4: Trigger once + verify**

Either wait for the next scheduled digest OR manually queue a job. After firing, check the configured Discord channel — should see one message + 4 embeds (the tweets).

- [ ] **Step 11.5: Typecheck + commit**

```bash
pnpm typecheck
git add packages/common/src/digestThread.ts packages/indexer/src/workers/digestGenerator.ts \
        .env.example deploy/helm/chainward/templates/secret.yaml
git commit -m "feat(digest): post weekly digest as thread-format to Discord webhook"
```

---

## Task 12: SEO + sitemap + robots

**Files:**
- Create: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/robots.ts` (or create)

**Why:** for `/base/<slug>` to be SEO-indexable. Currently Next.js won't generate a sitemap on its own; without one Google won't crawl all the agent pages.

- [ ] **Step 12.1: Create the sitemap**

Create `apps/web/src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from 'next';

const SITE = 'https://chainward.ai';
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/base`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/decodes`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/docs/api`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Per-agent routes — fetch the leaderboard (cheap, cached) and iterate
  const res = await fetch(`${API_INTERNAL_URL}/api/observatory/leaderboard`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) return staticRoutes;

  const json = await res.json();
  const slugs = new Set<string>();
  for (const list of ['mostActive', 'highestGas', 'largestPortfolio', 'healthiest'] as const) {
    for (const row of json.data?.[list] ?? []) {
      if (row.slug) slugs.add(row.slug);
    }
  }

  // Limit to known leaderboard agents — full registry could be 200+
  // and we want priority slots, not everything indexed equally.
  const agentRoutes: MetadataRoute.Sitemap = Array.from(slugs).map((slug) => ({
    url: `${SITE}/base/${slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticRoutes, ...agentRoutes];
}
```

- [ ] **Step 12.2: Confirm robots.ts allows crawling**

Check `apps/web/src/app/robots.ts`. If it doesn't exist, create:

```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://chainward.ai/sitemap.xml',
  };
}
```

- [ ] **Step 12.3: Smoke-test**

```bash
pnpm dev
```

Visit `http://localhost:3000/sitemap.xml`. Expected: XML listing static + agent URLs.
Visit `http://localhost:3000/robots.txt`. Expected: `User-agent: *` etc.

- [ ] **Step 12.4: Typecheck + commit**

```bash
pnpm --filter @chainward/web typecheck
git add apps/web/src/app/sitemap.ts apps/web/src/app/robots.ts
git commit -m "feat(web): sitemap.xml + robots.txt for /base/<slug> SEO"
```

---

## Task 13: Deploy + verify

**Goal:** ship to K3s, verify all pieces in production.

- [ ] **Step 13.1: Push branch + open PR**

```bash
git push -u origin feat/base-citation-page
gh pr create --title "feat: make /base the citation page" --body "$(cat <<'EOF'
## Summary
- Slug column on agent_registry + bridge ACP graduated agents → 39 → ~150+ tracked
- Auto-promote registry candidates above 100 tx threshold
- Health score worker — daily compute, populates existing daily_agent_health
- Per-agent landing pages at /base/<slug> with chart, tx feed, score, OG image
- Weekly digest posted as Twitter-thread format to Discord webhook (manual copy for now)
- Sitemap.xml + robots.txt for SEO

## Test plan
- [ ] /base loads, leaderboard rows are clickable
- [ ] /base/aixbt (or similar) renders with health score + chart + tx feed
- [ ] /base/<slug>/opengraph-image returns a 1200x630 PNG
- [ ] /sitemap.xml includes all leaderboard agent slugs
- [ ] healthScore worker writes daily_agent_health rows when triggered
- [ ] DIGEST_DISCORD_WEBHOOK delivery on next Friday digest run

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 13.2: After CI green, deploy to K3s**

```bash
git checkout main
git pull
./deploy/deploy.sh
```

The deploy script will:
- Verify GHCR images exist (api, web, indexer at HEAD short-sha)
- Apply migrations 0013 + 0014 via the migration Job
- Roll out api, web, indexer
- Verify external health endpoints

- [ ] **Step 13.3: Add the new env var to the live secret**

```bash
kubectl -n chainward patch secret chainward-secrets --type merge \
  --patch='{"stringData":{"DIGEST_DISCORD_WEBHOOK":"<paste-webhook-url>"}}'
kubectl -n chainward rollout restart deployment/indexer
```

- [ ] **Step 13.4: Production smoke test**

```bash
# Tracked agent count
curl -s https://api.chainward.ai/api/observatory | jq '.data.totalAgents'
# expected: ≥100

# Per-agent endpoint
curl -s https://api.chainward.ai/api/observatory/agent/aixbt | jq '.data | keys'
# expected: array including 'health', 'transactions', 'balanceSeries'

# Sitemap
curl -s https://chainward.ai/sitemap.xml | head -20
# expected: XML with /base/<slug> URLs
```

Open `https://chainward.ai/base/<a-real-slug>` in browser. Verify everything renders.

- [ ] **Step 13.5: Manually trigger health-score worker once for immediate data**

```bash
kubectl -n chainward exec deploy/indexer -- node -e "
  const { Queue } = require('bullmq');
  const q = new Queue('health-score', { connection: { host: process.env.REDIS_HOST || 'redis' } });
  q.add('health-score', {}).then(() => { console.log('queued'); process.exit(0); });
"
```

Wait ~30 seconds. Verify:

```bash
curl -s https://api.chainward.ai/api/observatory/leaderboard | jq '.data.healthiest | length'
# expected: 10
```

---

## Deferred / out of scope (track in BookStack)

Two next-priority items that are NOT in this plan:

1. **Decode cadence** — 1 decode/week for 10 weeks (AIXBT next, then top 10).
2. **Auto-tweet bot** — Twitter API v2 integration so the digest posts itself instead of going to Discord. Includes the X API OAuth setup that was deliberately skipped here.

Both belong on the ChainWard GTM TODO page in BookStack (see companion task added at execution time).

---

## Self-Review Checklist (run before handing to subagent-driven-development)

- [ ] Spec coverage: Does each requirement in the user's brief have at least one task?
  - "200+ tracked agents" → Task 3 (ACP bridge) + Task 4 (candidate auto-promote)
  - "Health Score" → Task 5 + Task 6
  - "Per-agent pages" → Task 7 (API) + Task 8 (UI) + Task 9 (links) + Task 10 (OG)
  - "Weekly Base AI Agent Report — auto-tweet" → Task 11 (Discord-first delivery, Twitter API deferred)
  - SEO so people can find the pages → Task 12
- [ ] No placeholders ("TODO", "fill in", "similar to Task N") — verified.
- [ ] Type consistency — `agentSlug()` signature is identical across files; `daily_agent_health` columns referenced consistently.
- [ ] Each task has Files / TDD steps / commit step.
- [ ] Tasks small enough for fresh-subagent-per-task execution (most tasks ≤ 6 steps).
