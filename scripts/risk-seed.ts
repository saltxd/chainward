/**
 * Risk-Check Library Seed
 *
 * Pre-populates the public risk library so it is non-empty at launch. Batch-
 * enqueues a (free) risk-check decode for:
 *
 *   1. Every curated observatory agent wallet (via @chainward/intelligence-loader,
 *      the same source packages/db/seeds/observatory-agents.ts reads).
 *   2. The primary subject wallet of each published decode under deliverables/*,
 *      resolved from apps/api/src/data/decode-manifest.json (the structured,
 *      already-resolved address index the manifest builder produces).
 *
 * It enqueues onto the SAME `risk-check` BullMQ queue the API route uses, with the
 * SAME `risk-<address>` jobId convention. Because BullMQ refuses to re-add a job
 * whose id already exists, the seed is naturally IDEMPOTENT — re-running it never
 * double-enqueues a target, and it never touches an address that already has a
 * fresh cached report. The riskCheck worker (packages/indexer) does the live
 * fetch + classify + persist; this script only fills the queue.
 *
 * It is rate-limited (a small inter-enqueue delay, default 250ms) so a cold start
 * can't flood the worker / sentinel node in one burst.
 *
 * This script ONLY enqueues — it never runs the decode itself and writes no rows.
 *
 * Run (needs DATABASE_URL + REDIS_URL; reads intelligence locally):
 *   pnpm risk:seed                 # enqueue every target, skipping fresh reports
 *   pnpm risk:seed --dry-run       # resolve + print targets, enqueue nothing
 *   pnpm risk:seed --observatory   # observatory wallets only
 *   pnpm risk:seed --decodes       # decode subjects only
 *   pnpm risk:seed --all-decode-addresses  # every manifest address, not just subjects
 *   pnpm risk:seed --limit 20      # cap the number of targets
 *   pnpm risk:seed --delay-ms 500  # inter-enqueue delay
 *   pnpm risk:seed --force         # force a re-check even when a fresh report exists
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { getObservatoryAgents, getIntelligenceSource } from '@chainward/intelligence-loader';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const CHAIN = 'base';
const QUEUE_NAME = 'risk-check';
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Self-flag guard: the seed never enqueues platform / placeholder wallets. The
// observatory seed uses the zero address as the system user wallet; it must never
// be sent through the risk classifier.
const ALLOWLIST_SKIP = new Set<string>([
  '0x0000000000000000000000000000000000000000',
]);

// ── Args ──────────────────────────────────────────────────────────────────

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return idx > 0 && process.argv[idx + 1] ? (process.argv[idx + 1] as string) : fallback;
}

const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const ONLY_OBSERVATORY = hasFlag('--observatory');
const ONLY_DECODES = hasFlag('--decodes');
const ALL_DECODE_ADDRESSES = hasFlag('--all-decode-addresses');
const DELAY_MS = Math.max(0, parseInt(getArg('--delay-ms', '250'), 10) || 0);
const LIMIT = parseInt(getArg('--limit', '0'), 10) || 0; // 0 == no cap

// ── Types ───────────────────────────────────────────────────────────────────

interface SeedTarget {
  /** Lowercased 0x wallet address — the dedupe + jobId key. */
  address: string;
  /** Optional human label for logs (observatory agent name / decode slug). */
  label?: string;
  /** Where this target came from, for the summary. */
  source: 'observatory' | 'decode';
}

interface DecodeManifestEntry {
  slug: string;
  title: string;
  addresses: string[];
}

interface DecodeManifest {
  decodes: DecodeManifestEntry[];
}

// Mirrors the riskCheck worker's RiskCheckJobData (packages/indexer/src/workers/riskCheck.ts).
interface RiskCheckJobData {
  input: string;
  walletAddress: string;
  agentHandle?: string;
  chain: string;
  forceRecheck: boolean;
}

// ── Target collection ─────────────────────────────────────────────────────

async function collectObservatoryTargets(): Promise<SeedTarget[]> {
  const agents = await getObservatoryAgents();
  const targets: SeedTarget[] = [];
  for (const agent of agents) {
    const address = agent.address?.toLowerCase();
    if (!address || !ADDRESS_RE.test(address)) continue;
    targets.push({ address, label: agent.name, source: 'observatory' });
  }
  return targets;
}

function loadDecodeManifest(): DecodeManifest | null {
  const manifestPath = resolve(REPO_ROOT, 'apps/api/src/data/decode-manifest.json');
  if (!existsSync(manifestPath)) {
    console.warn(`Decode manifest not found at ${manifestPath} — skipping decode targets.`);
    console.warn('Run `node scripts/build-decode-manifest.mjs` to regenerate it.');
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as DecodeManifest;
}

function collectDecodeTargets(): SeedTarget[] {
  const manifest = loadDecodeManifest();
  if (!manifest) return [];

  const targets: SeedTarget[] = [];
  for (const decode of manifest.decodes) {
    const addrs = decode.addresses.filter((a) => ADDRESS_RE.test(a));
    if (addrs.length === 0) continue;

    // Default: the decode's PRIMARY subject wallet (first address in the entry —
    // the manifest lists the subject's own wallet(s) ahead of counterparties),
    // which keeps the seed to ~one target per published decode. `--all-decode-
    // addresses` widens this to every cited address (subjects + counterparties).
    const chosen = ALL_DECODE_ADDRESSES ? addrs : [addrs[0] as string];
    for (const address of chosen) {
      targets.push({ address: address.toLowerCase(), label: decode.slug, source: 'decode' });
    }
  }
  return targets;
}

/** Merge sources, drop allowlisted/placeholder wallets, dedupe by address (first label wins). */
function dedupeTargets(targets: SeedTarget[]): SeedTarget[] {
  const seen = new Map<string, SeedTarget>();
  for (const t of targets) {
    if (ALLOWLIST_SKIP.has(t.address)) continue;
    if (!seen.has(t.address)) seen.set(t.address, t);
  }
  return [...seen.values()];
}

// ── Enqueue ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  // We don't open a DB connection here (the worker persists rows); but the worker
  // it feeds needs both, so fail fast if the operator hasn't wired the env.
  if (!DRY_RUN && !redisUrl) {
    console.error('REDIS_URL is required to enqueue (use --dry-run to preview without it).');
    process.exit(1);
  }
  if (!DRY_RUN && !databaseUrl) {
    console.warn('DATABASE_URL is not set — the riskCheck worker will need it to persist reports.');
  }

  console.log(`Intelligence source: ${getIntelligenceSource()}`);

  // ── Resolve targets ──
  const collected: SeedTarget[] = [];
  if (!ONLY_DECODES) {
    const obs = await collectObservatoryTargets();
    console.log(`Observatory wallets: ${obs.length}`);
    collected.push(...obs);
  }
  if (!ONLY_OBSERVATORY) {
    const decodes = collectDecodeTargets();
    console.log(
      `Decode targets: ${decodes.length}${ALL_DECODE_ADDRESSES ? ' (all cited addresses)' : ' (primary subjects)'}`,
    );
    collected.push(...decodes);
  }

  let targets = dedupeTargets(collected);
  if (LIMIT > 0 && targets.length > LIMIT) {
    console.log(`Capping ${targets.length} targets to --limit ${LIMIT}`);
    targets = targets.slice(0, LIMIT);
  }

  console.log(
    `\nResolved ${targets.length} unique target(s) to seed` +
      `${DRY_RUN ? ' (dry-run — nothing will be enqueued)' : ''}.\n`,
  );

  if (targets.length === 0) {
    console.log('No targets resolved. Nothing to do.');
    process.exit(0);
  }

  if (DRY_RUN) {
    for (const t of targets) {
      console.log(`  [${t.source.padEnd(11)}] ${t.address}  ${t.label ?? ''}`);
    }
    console.log(`\nDry run complete. ${targets.length} target(s) would be enqueued.`);
    process.exit(0);
  }

  // ── Enqueue onto the same queue + jobId convention the API uses ──
  const connection = new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });

  let enqueued = 0;
  let skipped = 0; // jobId already present (idempotent re-run)

  try {
    for (const t of targets) {
      // jobId mirrors the route: `risk-<address>` for a normal check (deduped by
      // BullMQ), or a uniquely-keyed recheck job when --force is set.
      const jobId = FORCE ? `risk-${t.address}-recheck-${Date.now()}` : `risk-${t.address}`;

      // Idempotency guard: when not forcing, skip if a job with this id already
      // exists (queued/active/completed-but-retained). BullMQ would silently
      // de-dupe on add, but checking first lets us report an accurate count.
      if (!FORCE) {
        const existing = await queue.getJob(jobId);
        if (existing) {
          skipped++;
          console.log(`  skip (already queued): ${t.address}  ${t.label ?? ''}`);
          if (DELAY_MS > 0) await sleep(DELAY_MS);
          continue;
        }
      }

      const data: RiskCheckJobData = {
        input: t.address,
        walletAddress: t.address,
        chain: CHAIN,
        forceRecheck: FORCE,
      };

      await queue.add('risk-check', data, { jobId });
      enqueued++;
      console.log(`  enqueued: ${t.address}  ${t.label ?? ''}`);

      // Rate limit: small inter-enqueue delay so a cold seed doesn't flood the
      // worker / sentinel node in one burst.
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }

    console.log(
      `\nDone. Enqueued ${enqueued}, skipped ${skipped} (already queued), ` +
        `${targets.length} total target(s).`,
    );
    console.log('The riskCheck worker (packages/indexer) will decode + cache each report.');
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

main().catch((err) => {
  console.error('risk-seed failed:', err);
  process.exit(1);
});
