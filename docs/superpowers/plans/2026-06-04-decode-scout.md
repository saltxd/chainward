# Decode Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly pure-SQL agent that surfaces the top decode candidate (anomaly × reach over `acp_agent_data`) to a Discord channel with a copy-paste-ready `decode 0x…` command, gated by the user's tap.

**Architecture:** A new `decode-scout` worker inside the existing `@chainward/indexer` package (so it ships in the indexer Docker image — no new image, no Claude, no extra deps). It runs as a weekly K3s CronJob in the `chainward` namespace, queries `acp_agent_data` directly via `createDb(DATABASE_URL)`, ranks candidates, dedups against decoded `deliverables/` + a `scout_surfaced` cooldown table, and POSTs the top candidate to `SCOUT_DISCORD_WEBHOOK`. All failures + a per-run heartbeat go to `OPS_DISCORD_WEBHOOK`. The scout NEVER triggers a decode — the user does, by sending the emitted command to Claude_Dev.

**Tech Stack:** TypeScript (ESM), drizzle-orm + postgres, tsup (build), vitest (tests), Helm CronJob, Discord webhooks.

---

## File Structure

**New files (all inside the indexer package + chainward repo):**
- `packages/indexer/src/scout/scoring.ts` — pure scoring functions (anomaly, reach, juice, NULL-safe gap). No I/O. Fully unit-tested.
- `packages/indexer/src/scout/dedup.ts` — decoded-name recovery from `deliverables/*/*.md` frontmatter + `scout_surfaced` cooldown query helpers.
- `packages/indexer/src/scout/ping.ts` — Discord webhook POST + ping/heartbeat/failure message rendering. Includes the safety-invariant (no `<@\d+>` mention).
- `packages/indexer/src/scout/detect.ts` — the DB query (select candidate rows from `acp_agent_data`) + orchestration glue used by the entrypoint.
- `packages/indexer/src/scout/index.ts` — entrypoint: detect → dedup → pick → ping → record; heartbeat + loud failure routing. This is the tsup entry / `node dist/scout.js` target.
- `packages/indexer/src/scout/__tests__/scoring.test.ts` — scoring unit tests.
- `packages/indexer/src/scout/__tests__/dedup.test.ts` — dedup/frontmatter-recovery tests.
- `packages/indexer/src/scout/__tests__/ping.test.ts` — ping render + safety-invariant test.
- `packages/db/src/migrations/0015_scout_surfaced.sql` — the cooldown state table.
- `deploy/helm/chainward/templates/decode-scout-cronjob.yaml` — weekly CronJob.

**Modified files:**
- `packages/indexer/tsup.config.ts` — add `src/scout/index.ts` as a second build entry.
- `packages/indexer/package.json` — add `scout:run` + ensure `test` covers the new dir (vitest auto-discovers, no change needed beyond confirming).
- `deploy/helm/chainward/values.yaml` — add scout schedule/enabled knobs if desired (optional; CronJob can hardcode).

**Decoded-set note for dedup:** existing `deliverables/` dirs whose frontmatter titles must be recognized as decoded: `aixbt`, `axelrod-on-chain`, `bankr-hack-trace`, `bridgekitty-on-chain`, `ethy-ai-decode`, `opengradient-on-chain`, `wasabot-decode`, plus non-agent pages (`acp-leaderboard-audit`, `agdp-fdv-disconnect`, `base-mcp-find-the-tag`, `live-leaderboard-2026-04`) which should be harmlessly ignored (no matching agent name).

---

## Task 1: Scoring module (pure functions, NULL-safe gap)

**Files:**
- Create: `packages/indexer/src/scout/scoring.ts`
- Test: `packages/indexer/src/scout/__tests__/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/indexer/src/scout/__tests__/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { scoreCandidate, type AgentRow } from '../scoring.js';

const base: AgentRow = {
  acpId: 1, name: 'Boring Agent', walletAddress: '0x' + '1'.repeat(40),
  twitterHandle: null, grossAgenticAmount: 2000, revenue: 1500,
  uniqueBuyerCount: 5, transactionCount: 10, walletBalance: '1500',
  successfulJobCount: 10, lastActiveAt: new Date().toISOString(),
};

describe('scoreCandidate — aGDP/revenue gap (NULL-safe)', () => {
  it('flags the Wasabot pattern: high aGDP, NULL revenue → unmeasurable bucket, high juice', () => {
    const r = scoreCandidate({ ...base, name: 'Wasabot', grossAgenticAmount: 81_000_000, revenue: null, uniqueBuyerCount: 400 });
    expect(r.gapBucket).toBe('unmeasurable'); // NULL revenue is its own bucket, not +Inf
    expect(r.anomaly).toBeGreaterThan(0.5);
    expect(r.juice).toBeGreaterThan(0);
  });

  it('computes a finite ratio when revenue is present and < aGDP', () => {
    const r = scoreCandidate({ ...base, name: 'Gapper', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 200 });
    expect(r.gapBucket).toBe('measured');
    expect(r.ratio).toBeCloseTo(200, 0); // 1_000_000 / 5000
    expect(r.anomaly).toBeGreaterThan(0.5);
  });

  it('clamps data-artifact rows where revenue > aGDP (ratio < 1) to non-anomaly', () => {
    const r = scoreCandidate({ ...base, grossAgenticAmount: 1000, revenue: 9999 });
    expect(r.anomaly).toBe(0);
  });

  it('floors out micro-agents below $5k aGDP (no phantom gaps)', () => {
    const r = scoreCandidate({ ...base, grossAgenticAmount: 490, revenue: 1, uniqueBuyerCount: 0 });
    expect(r.belowFloor).toBe(true);
    expect(r.juice).toBe(0);
  });

  it('flags the 99,999,999.99 aGDP cap as a data flag', () => {
    const r = scoreCandidate({ ...base, name: 'Capped', grossAgenticAmount: 99_999_999.99, revenue: null });
    expect(r.capFlag).toBe(true);
  });

  it('reach uses unique_buyer_count; juice = anomaly * reach, higher buyers → higher juice', () => {
    const lo = scoreCandidate({ ...base, name: 'Lo', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 10 });
    const hi = scoreCandidate({ ...base, name: 'Hi', grossAgenticAmount: 1_000_000, revenue: 5000, uniqueBuyerCount: 1000 });
    expect(hi.juice).toBeGreaterThan(lo.juice);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/scoring -- --run`
Expected: FAIL — `Cannot find module '../scoring.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/indexer/src/scout/scoring.ts
export interface AgentRow {
  acpId: number;
  name: string;
  walletAddress: string;
  twitterHandle: string | null;
  grossAgenticAmount: number | null;
  revenue: number | null;
  uniqueBuyerCount: number | null;
  transactionCount: number | null;
  walletBalance: string | null;
  successfulJobCount: number | null;
  lastActiveAt: string | null;
}

export interface ScoreResult {
  anomaly: number;      // 0..1
  reach: number;        // raw unique buyers (for ranking)
  juice: number;        // anomaly * normalized reach
  ratio: number | null; // aGDP/revenue when measurable
  gapBucket: 'measured' | 'unmeasurable' | 'none';
  belowFloor: boolean;
  capFlag: boolean;
  proof: string;        // human-readable one-liner for the ping
}

const AGDP_FLOOR = 5_000;
const AGDP_CAP = 99_999_999.99;
const RATIO_ALERT = 100; // manual scout threshold

export function scoreCandidate(a: AgentRow): ScoreResult {
  const agdp = a.grossAgenticAmount ?? 0;
  const rev = a.revenue;
  const buyers = a.uniqueBuyerCount ?? 0;
  const capFlag = Math.abs(agdp - AGDP_CAP) < 0.011;

  if (agdp < AGDP_FLOOR) {
    return { anomaly: 0, reach: buyers, juice: 0, ratio: null, gapBucket: 'none', belowFloor: true, capFlag, proof: '' };
  }

  let anomaly = 0;
  let ratio: number | null = null;
  let gapBucket: ScoreResult['gapBucket'] = 'none';

  if (rev === null || rev === 0) {
    // Wasabot pattern: real aGDP, no/zero on-chain revenue → its own bucket, NOT +Inf.
    gapBucket = 'unmeasurable';
    // scale anomaly with aGDP magnitude (log-normalized 0..1), capped.
    anomaly = Math.min(Math.log10(agdp + 1) / 9, 1);
  } else if (rev >= agdp) {
    // data artifact (revenue > aGDP) — not a real gap.
    anomaly = 0;
    ratio = agdp / rev;
    gapBucket = 'measured';
  } else {
    ratio = agdp / rev;
    gapBucket = 'measured';
    // ratio >= RATIO_ALERT → strong; log-normalize between 1x and 10000x.
    anomaly = Math.min(Math.log10(ratio) / Math.log10(10_000), 1);
  }

  // reach: normalize unique buyers to 0..1 for the juice product, keep raw for ranking/proof.
  const reachNorm = Math.min(Math.log10(buyers + 1) / 4, 1);
  const juice = anomaly * reachNorm;

  const agdpStr = agdp >= 1e6 ? `$${(agdp / 1e6).toFixed(1)}M` : agdp >= 1e3 ? `$${(agdp / 1e3).toFixed(1)}K` : `$${agdp.toFixed(0)}`;
  const revStr = rev === null || rev === 0 ? 'no on-chain revenue' : rev >= 1e3 ? `$${(rev / 1e3).toFixed(1)}K` : `$${rev.toFixed(0)}`;
  const ratioStr = ratio && ratio >= 1 ? ` — ${Math.round(ratio).toLocaleString()}× gap` : gapBucket === 'unmeasurable' ? ` — unmeasurable gap` : '';
  const proof = `${agdpStr} aGDP vs ${revStr}${ratioStr}; ${buyers.toLocaleString()} unique on-chain buyers`;

  return { anomaly, reach: buyers, juice, ratio, gapBucket, belowFloor: false, capFlag, proof };
}

// expose for the entrypoint's threshold gate
export const SCOUT_THRESHOLDS = { AGDP_FLOOR, AGDP_CAP, RATIO_ALERT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/scoring -- --run`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/scout/scoring.ts packages/indexer/src/scout/__tests__/scoring.test.ts
git commit -m "feat(scout): NULL-safe anomaly×reach scoring with \$5k floor + ratio clamp"
```

---

## Task 2: Dedup module (decoded-name recovery + cooldown query)

**Files:**
- Create: `packages/indexer/src/scout/dedup.ts`
- Test: `packages/indexer/src/scout/__tests__/dedup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/indexer/src/scout/__tests__/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { recoverDecodedNames, isDecoded } from '../dedup.js';

describe('dedup — decoded-name recovery from frontmatter (NOT slugify-dirname)', () => {
  it('recovers agent name token from a frontmatter title, stripping decode suffixes', () => {
    const md = '---\ntitle: "Wasabot On-Chain Decode"\nslug: wasabot-decode\n---\nbody';
    const names = recoverDecodedNames([{ dir: 'wasabot-decode', file: 'decode.md', content: md }]);
    expect(names.has('wasabot')).toBe(true);
  });

  it('handles AIXBT-style title', () => {
    const md = '---\ntitle: "AIXBT On-Chain Decode"\n---\n';
    const names = recoverDecodedNames([{ dir: 'aixbt', file: 'decode.md', content: md }]);
    expect(names.has('aixbt')).toBe(true);
  });

  it('ignores non-decode helper files (no title match)', () => {
    const md = '## checklist\n- a';
    const names = recoverDecodedNames([{ dir: 'wasabot-decode', file: 'publish-checklist.md', content: md }]);
    expect(names.size).toBe(0);
  });

  it('isDecoded matches case-insensitively on the agent name token', () => {
    const set = new Set(['wasabot', 'aixbt']);
    expect(isDecoded('Wasabot', set)).toBe(true);
    expect(isDecoded('Otto', set)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/dedup -- --run`
Expected: FAIL — `Cannot find module '../dedup.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/indexer/src/scout/dedup.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '@chainward/db';
import { sql } from 'drizzle-orm';

const SKIP_FILES = ['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md', 'review-report.md'];

export interface DeliverableFile { dir: string; file: string; content: string; }

/** Recover the set of already-decoded agent NAME tokens from deliverables/*/*.md frontmatter titles.
 * Mirrors scripts/decode-candidates.ts:52-77 — do NOT assume slugify(name) === dirname. */
export function recoverDecodedNames(files: DeliverableFile[]): Set<string> {
  const names = new Set<string>();
  for (const f of files) {
    if (SKIP_FILES.includes(f.file) || !f.file.endsWith('.md')) continue;
    const fm = f.content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const t = fm[1].match(/^title:\s*"?([^"\n]+?)"?\s*$/m);
    if (!t) continue;
    const token = t[1].toLowerCase().split(/\s+(on-chain|deep dive|decode)/)[0].trim();
    if (token) names.add(token);
  }
  return names;
}

/** Read the deliverables dir from disk into DeliverableFile[]. */
export function readDeliverables(deliverablesDir: string): DeliverableFile[] {
  if (!existsSync(deliverablesDir)) return [];
  const out: DeliverableFile[] = [];
  for (const d of readdirSync(deliverablesDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dirPath = join(deliverablesDir, d.name);
    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith('.md')) continue;
      out.push({ dir: d.name, file, content: readFileSync(join(dirPath, file), 'utf-8') });
    }
  }
  return out;
}

export function isDecoded(agentName: string, decoded: Set<string>): boolean {
  return decoded.has(agentName.toLowerCase().trim());
}

/** Wallets surfaced (pinged) within the cooldown window — re-pinging these is spam. */
export async function recentlySurfaced(db: Database, weeks = 4): Promise<Set<string>> {
  const rows = await db.execute(
    sql`SELECT wallet_address FROM scout_surfaced WHERE surfaced_at > now() - (${weeks} || ' weeks')::interval`,
  );
  return new Set((rows as Array<{ wallet_address: string }>).map((r) => r.wallet_address.toLowerCase()));
}

/** Record a surfaced candidate AFTER successful webhook delivery (deliver-then-record). */
export async function recordSurfaced(db: Database, walletAddress: string, slug: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO scout_surfaced (wallet_address, slug, surfaced_at)
        VALUES (${walletAddress.toLowerCase()}, ${slug}, now())
        ON CONFLICT (wallet_address) DO UPDATE SET slug = EXCLUDED.slug, surfaced_at = now()`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/dedup -- --run`
Expected: PASS (4 tests). (DB functions `recentlySurfaced`/`recordSurfaced` are not unit-tested here — covered by the e2e dry run in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/scout/dedup.ts packages/indexer/src/scout/__tests__/dedup.test.ts
git commit -m "feat(scout): decoded-name recovery from frontmatter + scout_surfaced cooldown helpers"
```

---

## Task 3: Migration for the `scout_surfaced` cooldown table

**Files:**
- Create: `packages/db/src/migrations/0015_scout_surfaced.sql`

- [ ] **Step 1: Write the migration**

```sql
-- packages/db/src/migrations/0015_scout_surfaced.sql
-- Tracks decode candidates the scout has SURFACED (pinged) so it doesn't re-ping
-- the same wallet within the cooldown window. Cron pods are ephemeral — state
-- must live in the DB, not a file. Mirrors prober_state (migration 0012).
CREATE TABLE IF NOT EXISTS scout_surfaced (
  wallet_address text PRIMARY KEY,
  slug          text,
  surfaced_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scout_surfaced_at ON scout_surfaced (surfaced_at);
```

- [ ] **Step 2: Verify it's syntactically valid + idempotent**

Run: `grep -c "IF NOT EXISTS" packages/db/src/migrations/0015_scout_surfaced.sql`
Expected: `2` (table + index both guarded — re-runnable, matches the repo's `IF NOT EXISTS` convention)

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/0015_scout_surfaced.sql
git commit -m "feat(db): scout_surfaced cooldown table (migration 0015)"
```

---

## Task 4: Ping module (Discord render + safety invariant)

**Files:**
- Create: `packages/indexer/src/scout/ping.ts`
- Test: `packages/indexer/src/scout/__tests__/ping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/indexer/src/scout/__tests__/ping.test.ts
import { describe, it, expect } from 'vitest';
import { renderCandidate, renderHeartbeat, type Candidate } from '../ping.js';

const cand: Candidate = {
  name: 'Wasabot',
  walletAddress: '0xAbC0000000000000000000000000000000000001',
  proof: '$81.0M aGDP vs no on-chain revenue — unmeasurable gap; 412 unique on-chain buyers',
};

describe('renderCandidate', () => {
  it('emits decode 0x<address> as the primary command (address path, always valid)', () => {
    const msg = renderCandidate(cand);
    expect(msg).toContain('decode 0xabc0000000000000000000000000000000000001'.toLowerCase());
  });

  it('SAFETY INVARIANT: contains no real <@digits> mention that could trigger Claude_Dev', () => {
    const msg = renderCandidate(cand);
    expect(/<@\d+>/.test(msg)).toBe(false);
  });

  it('emits decode @<name> ONLY when the name matches the handle regex', () => {
    expect(renderCandidate({ ...cand, name: 'Wasabot' })).toContain('decode @Wasabot');
    expect(renderCandidate({ ...cand, name: 'Degen Claw' })).not.toContain('decode @Degen Claw');
  });
});

describe('renderHeartbeat', () => {
  it('always reports the run even when no candidate', () => {
    expect(renderHeartbeat({ scanned: 120, topJuice: 0, candidate: null }))
      .toContain('candidate=none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/ping -- --run`
Expected: FAIL — `Cannot find module '../ping.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/indexer/src/scout/ping.ts
const HANDLE_RE = /^[A-Za-z0-9_-]+$/; // matches auto-decode validators.ts HANDLE_RE minus the leading @

export interface Candidate {
  name: string;
  walletAddress: string;
  proof: string;
}

export interface HeartbeatData {
  scanned: number;
  topJuice: number;
  candidate: string | null;
}

/** The candidate ping. Primary command is the 0x address (skips ACP name lookup → always valid).
 * @name command added only when the name is a single safe token. NO <@id> mention (safety invariant). */
export function renderCandidate(c: Candidate): string {
  const addr = c.walletAddress.toLowerCase();
  const lines = [
    `🔭 **Decode candidate: ${c.name}**`,
    c.proof,
    '',
    'Ship it → send ONE of these to Claude_Dev (DM or @mention):',
    '```',
    `decode ${addr}`,
  ];
  if (HANDLE_RE.test(c.name)) lines.push(`decode @${c.name}`);
  lines.push('```');
  return lines.join('\n');
}

export function renderHeartbeat(d: HeartbeatData): string {
  return `🛰️ scout ran: ${d.scanned} scanned, top juice=${d.topJuice.toFixed(3)}, candidate=${d.candidate ?? 'none'}`;
}

export function renderFailure(stage: string, detail: string): string {
  return `⚠️ **decode-scout FAILED** at ${stage}: ${detail.slice(0, 300)}`;
}

/** POST to a Discord webhook. Returns true on 2xx. allowed_mentions.parse=[] => never pings anyone. */
export async function postDiscord(webhookUrl: string, content: string): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  return res.ok;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chainward/indexer test scout/__tests__/ping -- --run`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/scout/ping.ts packages/indexer/src/scout/__tests__/ping.test.ts
git commit -m "feat(scout): Discord ping render (address-primary command, no-mention safety invariant)"
```

---

## Task 5: Detector query (select candidate rows from acp_agent_data)

**Files:**
- Create: `packages/indexer/src/scout/detect.ts`

- [ ] **Step 1: Write the implementation**

(No standalone unit test — this is the DB query; it's exercised by the e2e dry run in Task 7. Keep it thin so the testable logic stays in `scoring.ts`/`dedup.ts`.)

```typescript
// packages/indexer/src/scout/detect.ts
import type { Database } from '@chainward/db';
import { sql } from 'drizzle-orm';
import type { AgentRow } from './scoring.js';

/** Pull candidate rows directly from acp_agent_data. Mirrors getEconomics() SQL shape
 * (observatoryService.ts) but WITHOUT its LIMIT 50 / successful_job_count>0 filter, which
 * would bias away from the zero-revenue outliers we hunt. Lean single query (shared pool max=10). */
export async function fetchCandidates(db: Database): Promise<AgentRow[]> {
  const rows = await db.execute(sql`
    SELECT
      acp_id                          AS "acpId",
      name,
      wallet_address                  AS "walletAddress",
      twitter_handle                  AS "twitterHandle",
      CAST(gross_agentic_amount AS double precision) AS "grossAgenticAmount",
      CAST(revenue AS double precision)              AS "revenue",
      unique_buyer_count              AS "uniqueBuyerCount",
      transaction_count               AS "transactionCount",
      wallet_balance                  AS "walletBalance",
      successful_job_count            AS "successfulJobCount",
      last_active_at                  AS "lastActiveAt"
    FROM acp_agent_data
    WHERE gross_agentic_amount IS NOT NULL
      AND CAST(gross_agentic_amount AS double precision) >= 5000
    ORDER BY gross_agentic_amount DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    acpId: Number(r.acpId),
    name: (r.name as string) ?? '(unnamed)',
    walletAddress: r.walletAddress as string,
    twitterHandle: (r.twitterHandle as string) ?? null,
    grossAgenticAmount: r.grossAgenticAmount === null ? null : Number(r.grossAgenticAmount),
    revenue: r.revenue === null ? null : Number(r.revenue),
    uniqueBuyerCount: r.uniqueBuyerCount === null ? null : Number(r.uniqueBuyerCount),
    transactionCount: r.transactionCount === null ? null : Number(r.transactionCount),
    walletBalance: (r.walletBalance as string) ?? null,
    successfulJobCount: r.successfulJobCount === null ? null : Number(r.successfulJobCount),
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt as string).toISOString() : null,
  }));
}

export const MALFUNCTION = {
  emptyRows: (n: number) => n === 0,
  allNullAgdp: (rows: AgentRow[]) => rows.length > 0 && rows.every((r) => r.grossAgenticAmount === null),
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chainward/indexer typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add packages/indexer/src/scout/detect.ts
git commit -m "feat(scout): detector query over acp_agent_data (uncapped, \$5k floor, malfunction guards)"
```

---

## Task 6: Entrypoint (detect → pick → ping → record; heartbeat + loud failures)

**Files:**
- Create: `packages/indexer/src/scout/index.ts`
- Modify: `packages/indexer/tsup.config.ts`
- Modify: `packages/indexer/package.json`

- [ ] **Step 1: Write the entrypoint**

```typescript
// packages/indexer/src/scout/index.ts
import { join } from 'node:path';
import { createDb } from '@chainward/db';
import { fetchCandidates, MALFUNCTION } from './detect.js';
import { scoreCandidate } from './scoring.js';
import { readDeliverables, recoverDecodedNames, isDecoded, recentlySurfaced, recordSurfaced } from './dedup.js';
import { renderCandidate, renderHeartbeat, renderFailure, postDiscord } from './ping.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  const DATABASE_URL = requireEnv('DATABASE_URL');
  const SCOUT_WEBHOOK = requireEnv('SCOUT_DISCORD_WEBHOOK');
  const OPS_WEBHOOK = requireEnv('OPS_DISCORD_WEBHOOK');
  // deliverables dir: repo root /deliverables. In the image WORKDIR=/app, so /app/deliverables
  // must be present. If absent (image doesn't ship it), DELIVERABLES_DIR env overrides.
  const deliverablesDir = process.env.DELIVERABLES_DIR ?? join(process.cwd(), 'deliverables');

  const db = createDb(DATABASE_URL);
  let rows;
  try {
    rows = await fetchCandidates(db);
  } catch (e) {
    await postDiscord(OPS_WEBHOOK, renderFailure('detect', String(e)));
    throw e;
  }

  // Malfunction guards: empty / all-null is a FAILURE, not "quiet market".
  if (MALFUNCTION.emptyRows(rows.length) || MALFUNCTION.allNullAgdp(rows)) {
    await postDiscord(OPS_WEBHOOK, renderFailure('detect', `malfunction: ${rows.length} rows, all-null aGDP=${MALFUNCTION.allNullAgdp(rows)}`));
    process.exit(1);
  }

  const decoded = recoverDecodedNames(readDeliverables(deliverablesDir));
  const cooled = await recentlySurfaced(db, 4);

  const ranked = rows
    .map((r) => ({ row: r, score: scoreCandidate(r) }))
    .filter(({ row, score }) =>
      !score.belowFloor &&
      score.juice > 0 &&
      !isDecoded(row.name, decoded) &&
      !cooled.has(row.walletAddress.toLowerCase()))
    .sort((a, b) => b.score.juice - a.score.juice);

  const top = ranked[0] ?? null;

  // Heartbeat ALWAYS (distinguishes dead cron from quiet market).
  await postDiscord(OPS_WEBHOOK, renderHeartbeat({
    scanned: rows.length,
    topJuice: top?.score.juice ?? 0,
    candidate: top?.row.name ?? null,
  }));

  if (!top) {
    console.log('[scout] no candidate above threshold; heartbeat sent.');
    return;
  }

  const delivered = await postDiscord(SCOUT_WEBHOOK, renderCandidate({
    name: top.row.name,
    walletAddress: top.row.walletAddress,
    proof: top.score.proof,
  }));

  if (!delivered) {
    await postDiscord(OPS_WEBHOOK, renderFailure('ping', `candidate webhook non-2xx for ${top.row.name}`));
    process.exit(1); // do NOT record surfaced — don't bury it behind cooldown on a delivery failure.
  }

  // deliver-then-record
  await recordSurfaced(db, top.row.walletAddress, `${top.row.name.toLowerCase().replace(/\s+/g, '-')}-on-chain`);
  console.log(`[scout] surfaced ${top.row.name} (${top.row.walletAddress}); juice=${top.score.juice.toFixed(3)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[scout] fatal', e); process.exit(1); });
```

- [ ] **Step 2: Add the tsup entry**

Modify `packages/indexer/tsup.config.ts` — change the `entry` line to:

```typescript
  entry: ['src/index.ts', 'src/scout/index.ts'],
```

(This makes `pnpm --filter @chainward/indexer build` emit `dist/scout/index.js` alongside `dist/index.js`, both with workspace deps bundled via the existing `noExternal`.)

- [ ] **Step 3: Add the run script**

Modify `packages/indexer/package.json` scripts block — add:

```json
    "scout:run": "node dist/scout/index.js",
    "scout:dev": "tsx src/scout/index.ts",
```

- [ ] **Step 4: Build + typecheck**

Run: `pnpm --filter @chainward/indexer build && pnpm --filter @chainward/indexer typecheck`
Expected: PASS; `ls packages/indexer/dist/scout/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/scout/index.ts packages/indexer/tsup.config.ts packages/indexer/package.json
git commit -m "feat(scout): entrypoint — detect→pick→ping→record, heartbeat + loud failure routing"
```

---

## Task 7: Local e2e dry run (real DB read, TEST webhook, no real ping)

**Files:** none created — verification task using a throwaway webhook.

- [ ] **Step 1: Build is current**

Run: `pnpm --filter @chainward/indexer build`
Expected: PASS.

- [ ] **Step 2: Run against the real DB with a TEST webhook**

Get the DB URL from the cluster secret (read-only) and point both webhooks at a throwaway/test Discord webhook (NOT the live #decode-scout). Run from repo root so `deliverables/` resolves:

```bash
cd ~/Forge/chainward
export DATABASE_URL="$(kubectl -n chainward get secret chainward-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d)"
export SCOUT_DISCORD_WEBHOOK="<test-webhook-url>"
export OPS_DISCORD_WEBHOOK="<test-webhook-url>"
node packages/indexer/dist/scout/index.js
```

Expected: a heartbeat message + (likely) one candidate message in the TEST channel. Console prints `[scout] surfaced <name> …`. NOTE: this requires DB reachability — if running off-cluster, port-forward: `kubectl -n chainward port-forward svc/postgres 5432:5432` and set `DATABASE_URL` host to `localhost`.

- [ ] **Step 3: Verify the emitted command actually resolves**

Take the `decode 0x…` line from the test ping and confirm `scripts/auto-decode` accepts it (parse only, no decode):

```bash
node -e "import('./scripts/auto-decode/lib/validators.ts').catch(()=>{})" 2>/dev/null; \
pnpm tsx -e "import {parseTarget} from './scripts/auto-decode/lib/validators.js'; console.log(parseTarget('0xabc0000000000000000000000000000000000001'))"
```

Expected: prints `{ kind: 'address', value: '0x...' }` (no throw). If the import path differs, confirm `parseTarget` accepts a 0x address per the spec's trigger contract.

- [ ] **Step 4: Verify dedup against real deliverables**

Confirm an already-decoded agent (e.g. Wasabot) is NOT the surfaced candidate:

```bash
node packages/indexer/dist/scout/index.js 2>&1 | grep -i wasabot && echo "BUG: surfaced a decoded agent" || echo "OK: decoded agents excluded"
```

Expected: `OK: decoded agents excluded`.

- [ ] **Step 5: Commit (nothing to commit — verification only)**

If Steps 2-4 surfaced bugs, fix in the relevant module + re-run its unit test, then re-run this task. No commit if clean.

---

## Task 8: CronJob manifest (weekly, chainward ns, indexer image)

**Files:**
- Create: `deploy/helm/chainward/templates/decode-scout-cronjob.yaml`

- [ ] **Step 1: Write the manifest**

```yaml
# deploy/helm/chainward/templates/decode-scout-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: decode-scout
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: chainward
    app.kubernetes.io/component: decode-scout
spec:
  schedule: "0 8 * * 1"            # Mon 08:00 — away from the 04-05/10:00 cron cluster
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 200
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      activeDeadlineSeconds: 600
      backoffLimit: 0
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: decode-scout
              image: "{{ .Values.images.indexer }}"
              imagePullPolicy: Always
              command: ["node", "dist/scout/index.js"]
              resources:
                requests:
                  cpu: 50m
                  memory: 128Mi
                limits:
                  cpu: 500m
                  memory: 512Mi
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: chainward-secrets
                      key: DATABASE_URL
                - name: SCOUT_DISCORD_WEBHOOK
                  valueFrom:
                    secretKeyRef:
                      name: chainward-secrets
                      key: SCOUT_DISCORD_WEBHOOK
                - name: OPS_DISCORD_WEBHOOK
                  valueFrom:
                    secretKeyRef:
                      name: chainward-secrets
                      key: PROBER_DISCORD_WEBHOOK   # reuse existing daily-ops webhook (no new secret value needed)
```

NOTE: the image must contain `/app/deliverables`. Verify the indexer Dockerfile's `COPY . .` (build stage) includes it; if `pnpm deploy --prod` strips non-package files, set `DELIVERABLES_DIR` env to an emptyDir or bake the decoded-name list differently. **Confirm during Step 2.**

- [ ] **Step 2: Verify the image actually contains deliverables/ (decides if env override is needed)**

Run: `docker run --rm --entrypoint sh "$(grep -A2 'images:' deploy/helm/chainward/values.yaml | grep indexer | awk '{print $2}')" -lc 'ls -d /app/deliverables >/dev/null 2>&1 && echo HAS_DELIVERABLES || echo NO_DELIVERABLES'`
Expected: `HAS_DELIVERABLES`. **If `NO_DELIVERABLES`:** the `pnpm deploy --prod` flatten dropped them. Fix by adding to the indexer Dockerfile runner stage: `COPY --from=build /app/deliverables ./deliverables`, rebuild, re-verify. (Document whichever path was taken in the commit.)

- [ ] **Step 3: helm template renders cleanly**

Run: `helm template chainward deploy/helm/chainward/ 2>/dev/null | grep -A30 'name: decode-scout' | grep -E 'schedule|image|Forbid|SCOUT_DISCORD|node'`
Expected: shows schedule `0 8 * * 1`, the indexer image, `Forbid`, the webhook env, and `node dist/scout/index.js`.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/chainward/templates/decode-scout-cronjob.yaml
git commit -m "feat(scout): weekly decode-scout CronJob (chainward ns, indexer image, fleet conventions)"
```

---

## Task 9: Full suite green + push

**Files:** none.

- [ ] **Step 1: Run the indexer test suite**

Run: `pnpm --filter @chainward/indexer test -- --run`
Expected: all scout tests pass (scoring 6, dedup 4, ping 4) + existing indexer tests still pass.

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Push (CI builds the indexer image with the scout entry baked in)**

```bash
git push origin <branch>
```

Expected: CI green. The indexer image now contains `dist/scout/index.js`; the CronJob references it.

- [ ] **Step 4: Confirm CI built + published the indexer image**

Run: `gh run list --repo saltxd/chainward --workflow=build.yml --limit 1`
Expected: latest run `success`. (The acp-decoder GHCR-access fix from this session means chainward images publish fine.)

---

## Deploy (user-gated — NOT part of autonomous execution)

These steps touch the live cluster + need user-created Discord webhooks. Do NOT run autonomously; surface for the user.

1. **User creates** `#decode-scout` Discord channel + webhook; confirms the ops/daily webhook URL.
2. **Patch the secrets** (out-of-band, like PROBER_DISCORD_WEBHOOK — `chainward-secrets` is NOT Helm-managed):
   ```bash
   kubectl -n chainward patch secret chainward-secrets --type merge \
     -p '{"stringData":{"SCOUT_DISCORD_WEBHOOK":"<url>","OPS_DISCORD_WEBHOOK":"<url>"}}'
   ```
3. **Apply migration 0015:** `./deploy/deploy.sh --migrate-only` (or the repo's migration runner).
4. **Render + apply the CronJob** (chart isn't auto-applied for new templates — same lesson as the prober drift): render just the decode-scout CronJob and `kubectl apply -f -`, OR `helm upgrade` chainward. Verify: `kubectl -n chainward get cronjob decode-scout`.
5. **Smoke test:** `kubectl -n chainward create job --from=cronjob/decode-scout scout-manual-$(date +%s)` → check the test ping lands in #decode-scout + heartbeat in ops.
6. **Confirm the reply target:** the ping says "send to Claude_Dev" — verify the `decode 0x…` command works against Claude_Dev's DM/@mention surface (it's the unchanged trigger).

---

## Self-review notes (done by author)

- **Spec coverage:** detector (T1+T5), reach=unique_buyer_count (T1), NULL-safe gap + $5k floor + clamp + cap-flag (T1), dedup frontmatter-recovery + cooldown DB table (T2+T3), ping address-primary + safety-invariant (T4), heartbeat + loud failure split-channel (T6), CronJob conventions Forbid/backoffLimit0/activeDeadline/startingDeadline/pullPolicy-Always (T8), zero-Claude/indexer-image (T6 tsup + T8), e2e dry run + emitted-command resolves (T7), CI publish (T9). Stage-2/dormant/supply correctly absent (deferred per spec).
- **Placeholders:** none — every code step has full code; `<test-webhook-url>` / `<branch>` / image-tag are runtime values the executor fills, not code gaps.
- **Type consistency:** `AgentRow` (scoring.ts) is the shared row type, imported by detect.ts + index.ts. `Candidate` (ping.ts) is constructed in index.ts from `top.row` + `top.score.proof`. `scoreCandidate`/`fetchCandidates`/`recoverDecodedNames`/`recentlySurfaced`/`recordSurfaced`/`renderCandidate`/`renderHeartbeat`/`postDiscord` names are consistent across tasks.
- **Open risk flagged in-plan:** T8 Step 2 verifies whether the indexer image ships `deliverables/` (dedup needs it) and gives the exact fix if not.
