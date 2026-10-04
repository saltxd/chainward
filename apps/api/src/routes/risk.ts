import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { formatEther, formatUnits } from 'viem';
import { riskReports } from '@chainward/db';
import {
  ATTEST_SCHEMA_UID,
  CLASSIFIER_VERSION,
  canonicalReportJson,
  easScanUrl,
  reportHash,
  reportUri,
  alchemyTransferSource,
  analyzeSellerDemand,
  DEMAND_WINDOW_DAYS,
  SELLER_BLOCKS_PER_DAY,
  SELLER_STABLECOINS,
  type RiskAssessment,
  type SellerChain,
} from '@chainward/decode';
import { KNOWN_CONTRACTS, RISK_CHAINS, RISK_CHAIN_IDS, type RiskChainId } from '@chainward/common';
import { rpcFixturesHaveHistory, type RpcFixtures } from '@chainward/decode';
import { fetchChainFixtures, teaserStatsFromFixtures } from '../lib/riskChainFixtures.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { getQueues } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { WalletLookupService } from '../services/walletLookupService.js';
import { extractProvenance, type ReportProvenance } from '../lib/reportProvenance.js';
import { buildCoverage, type ReportCoverage } from '../lib/reportCoverage.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// The original (and default) chain. Paid checks + attestation stay Base-only.
const CHAIN: RiskChainId = 'base';
const USDC_ADDRESS = KNOWN_CONTRACTS.base.USDC.toLowerCase();
const chainSchema = z.enum(RISK_CHAIN_IDS);

// A report is stale once it is older than this OR its classifier_version no
// longer matches the current engine. Stale reports are served free + flagged.
const REPORT_TTL_MS = parseInt(process.env.RISK_REPORT_TTL_MS ?? String(24 * 60 * 60 * 1000), 10);

// Bounded Blockscout history check — fail-open semantics mirror the acp-decoder
// (a Blockscout 5xx during a check shouldn't hard-reject a real wallet).
const HISTORY_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS ?? '15000', 10);

// In-flight marker TTL — long enough to cover a full background decode.
const PENDING_TTL_SEC = parseInt(process.env.RISK_PENDING_TTL_SEC ?? '180', 10);

const DISCLAIMER =
  'Risk flags from on-chain behavior only. ChainWard cannot see social engineering, ' +
  'off-chain agreements, or intent. Absence of flags is not a guarantee of safety.';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const addressSchema = z.string().regex(ADDRESS_RE, 'Invalid Ethereum address');

const checkBodySchema = z.object({
  target: z.string().min(1),
  force_recheck: z.boolean().optional(),
  /** Chain to check on. Defaults to base. */
  chain: chainSchema.optional(),
});

const librarySchema = z.object({
  sort: z.enum(['recent']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  // distinct=address → one card per address (its latest filing). Re-checks of
  // the same wallet otherwise surface as near-duplicate rows.
  distinct: z.enum(['address']).optional(),
  /** Restrict to one chain; default is every chain. */
  chain: chainSchema.optional(),
});

// ---------------------------------------------------------------------------
// Types (row → payload)
// ---------------------------------------------------------------------------

type RiskReportRow = typeof riskReports.$inferSelect;

interface FreshnessInfo {
  as_of_block: number;
  generated_at: string;
  ttl_state: 'fresh' | 'stale';
}

interface ReportPayload {
  address: string;
  chain: string;
  band: string;
  flags: RiskAssessment['flags'];
  not_assessed: string[];
  freshness: FreshnessInfo;
  /** Which RPC served the decode. Omitted for reports filed before it was recorded. */
  provenance?: ReportProvenance;
  /** Every check that ran (raised or not) + the window it saw. */
  coverage?: ReportCoverage;
  classifier_version: string;
  view_count: number;
  disclaimer: string;
  /** Present once the report is published on Base as an EAS attestation. */
  attestation?: AttestationInfo;
}

interface AttestationInfo {
  uid: string;
  tx: string | null;
  attested_at: string | null;
  schema_uid: string;
  explorer_url: string;
  /** Set when this attestation belongs to the previous report for the address (a re-check is pending attestation). */
  from_previous_report?: boolean;
}

interface TeaserPayload {
  address: string;
  chain: RiskChainId;
  /** Native asset of `chain` — the eth_balance figure is denominated in it. */
  native_symbol: string;
  public_stats: {
    tx_count: number;
    eth_balance: number;
    usdc_balance: number;
    token_count: number;
    unique_counterparties_30d: number;
    latest_transfer_at: string | null;
    is_acp_agent: boolean;
  };
  history_present: true;
}

interface TopFlagPreview {
  id: string;
  severity: string;
  title: string;
}

interface ReportCard {
  address: string;
  chain: string;
  agent_name?: string;
  band: string;
  flag_count: number;
  top_severity: string | null;
  /** Up to 3 flags (severity-ranked) denormalized at decode time — the card preview. */
  top_flags: TopFlagPreview[];
  as_of_date: string;
  view_count: number;
  report_url: string;
  /** Total public filings for this address. Only set in distinct=address mode. */
  report_count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTtlState(row: RiskReportRow): 'fresh' | 'stale' {
  const ageMs = Date.now() - new Date(row.generatedAt).getTime();
  if (ageMs > REPORT_TTL_MS) return 'stale';
  if (row.classifierVersion !== CLASSIFIER_VERSION) return 'stale';
  return 'fresh';
}

function rowToReport(row: RiskReportRow): ReportPayload {
  const assessment = row.riskAssessment as RiskAssessment;
  return {
    address: row.walletAddress,
    chain: row.chain,
    band: assessment.band,
    flags: assessment.flags,
    not_assessed: assessment.not_assessed,
    freshness: {
      as_of_block: row.asOfBlock,
      generated_at: new Date(row.generatedAt).toISOString(),
      ttl_state: computeTtlState(row),
    },
    provenance: extractProvenance(row.reportData),
    coverage: buildCoverage(row.reportData, assessment.flags),
    classifier_version: row.classifierVersion,
    view_count: row.viewCount,
    disclaimer: DISCLAIMER,
    ...(row.attestationUid ? { attestation: attestationInfo(row) } : {}),
  };
}

function attestationInfo(row: RiskReportRow): AttestationInfo {
  return {
    uid: row.attestationUid!,
    tx: row.attestationTx,
    attested_at: row.attestedAt ? new Date(row.attestedAt).toISOString() : null,
    schema_uid: ATTEST_SCHEMA_UID,
    explorer_url: easScanUrl(row.attestationUid!),
  };
}

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, info: 0 };

function topSeverity(row: RiskReportRow): string | null {
  const flags = (row.topFlags as Array<{ severity: string }> | null) ?? [];
  let top: string | null = null;
  for (const f of flags) {
    if (top === null || (SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[top] ?? 0)) {
      top = f.severity;
    }
  }
  return top;
}

/** The web report route for a filing — base stays bare so existing links hold. */
function reportPath(address: string, chain: string): string {
  return chain === CHAIN ? `/report/${address}` : `/report/${address}?chain=${chain}`;
}

function rowToCard(row: RiskReportRow): ReportCard {
  return {
    address: row.walletAddress,
    chain: row.chain,
    agent_name: row.agentName ?? undefined,
    band: row.band,
    flag_count: row.flagCount,
    top_severity: topSeverity(row),
    top_flags: (row.topFlags as TopFlagPreview[] | null) ?? [],
    as_of_date: new Date(row.generatedAt).toISOString(),
    view_count: row.viewCount,
    report_url: reportPath(row.walletAddress, row.chain),
  };
}

/** Most recent report for an address+chain, or undefined. */
async function latestReport(address: string, chain: RiskChainId = CHAIN): Promise<RiskReportRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(riskReports)
    .where(and(sql`lower(${riskReports.walletAddress}) = ${address.toLowerCase()}`, eq(riskReports.chain, chain)))
    .orderBy(desc(riskReports.generatedAt))
    .limit(1);
  return rows[0];
}

/**
 * Bounded Blockscout history pre-check. Fail-open: a Blockscout error returns a
 * non-zero count so a real wallet is never wrongly rejected as no_history.
 * Mirrors checkHistoryViaBlockscout in apps/acp-decoder/src/index.ts.
 */
async function checkHistory(address: string): Promise<{ transactions_count: number; token_transfers_count: number }> {
  try {
    const resp = await fetch(`https://base.blockscout.com/api/v2/addresses/${address}/counters`, {
      signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
    });
    if (!resp.ok) {
      logger.warn({ address, status: resp.status }, 'risk history check non-2xx; failing open');
      return { transactions_count: 1, token_transfers_count: 0 };
    }
    const body: any = await resp.json();
    return {
      transactions_count: parseInt(body.transactions_count ?? '0', 10),
      token_transfers_count: parseInt(body.token_transfers_count ?? '0', 10),
    };
  } catch (err: any) {
    logger.warn({ address, err: err.message }, 'risk history check threw; failing open');
    return { transactions_count: 1, token_transfers_count: 0 };
  }
}

/** One cheap ACP presence fetch — sets teaser.is_acp_agent without running the decode. */
async function isAcpAgent(address: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=${address}&pagination[pageSize]=1`,
      { signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!resp.ok) return false;
    const body: any = await resp.json();
    return Boolean(body?.data?.[0]?.id);
  } catch {
    return false;
  }
}

function hexToNumber(hex: string | null | undefined): bigint {
  if (!hex || hex === '0x') return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

/**
 * Cheap public_stats for a novel address from the wallet-lookup service (+ the
 * history counter we already fetched + one ACP presence check). NO flags — the
 * teaser never runs the risk classifier.
 */
async function buildTeaser(
  address: string,
  txCount: number,
  acpAgent: boolean,
  prefetchedLookup?: Awaited<ReturnType<WalletLookupService['lookup']>>,
): Promise<TeaserPayload> {
  const lookup = prefetchedLookup ?? (await new WalletLookupService(getRedis()).lookup(address));

  const native = lookup.balances.find((b) => b.contractAddress === 'native');
  const usdc = lookup.balances.find((b) => b.contractAddress.toLowerCase() === USDC_ADDRESS);

  const ethBalance = native ? Number(formatEther(hexToNumber(native.tokenBalance))) : 0;
  const usdcBalance = usdc ? Number(formatUnits(hexToNumber(usdc.tokenBalance), 6)) : 0;

  // Non-native token balances that are present (lookup returns hex; > 0).
  const tokenCount = lookup.balances.filter(
    (b) => b.contractAddress !== 'native' && hexToNumber(b.tokenBalance) > 0n,
  ).length;

  // Counterparties from the (capped) merged tx window — a lower bound, fine for a teaser.
  const counterparties = new Set<string>();
  for (const tx of lookup.transactions) {
    const other = tx.direction === 'inbound' ? tx.from : tx.to;
    if (other) counterparties.add(other.toLowerCase());
  }

  return {
    address: address.toLowerCase(),
    chain: CHAIN,
    native_symbol: RISK_CHAINS[CHAIN].nativeSymbol,
    public_stats: {
      tx_count: txCount,
      eth_balance: ethBalance,
      usdc_balance: usdcBalance,
      token_count: tokenCount,
      unique_counterparties_30d: counterparties.size,
      // Lookup carries no timestamps; the full decode fills this in.
      latest_transfer_at: null,
      is_acp_agent: acpAgent,
    },
    history_present: true,
  };
}

/** Base keeps its historical key/id shapes; other chains are namespaced. */
function pendingKey(address: string, chain: RiskChainId): string {
  const addr = address.toLowerCase();
  return chain === CHAIN ? `risk:pending:${addr}` : `risk:pending:${chain}:${addr}`;
}

function jobIdFor(address: string, chain: RiskChainId, suffix?: string): string {
  const addr = address.toLowerCase();
  const head = chain === CHAIN ? `risk-${addr}` : `risk-${chain}-${addr}`;
  return suffix ? `${head}-${suffix}` : head;
}

/** Recover (address, chain) from our jobId convention `risk-[<chain>-]<addr>[-recheck-...]`. */
function parseJobId(id: string): { address: string; chain: RiskChainId } | null {
  const m = id.match(/^risk-(?:([a-z0-9]+)-)?(0x[a-fA-F0-9]{40})/);
  if (!m?.[2]) return null;
  const chain = m[1] ?? CHAIN;
  if (!(RISK_CHAIN_IDS as readonly string[]).includes(chain)) return null;
  return { address: m[2], chain: chain as RiskChainId };
}

/**
 * Chain-aware pre-check for chains read through public RPC only (no Blockscout,
 * no wallet-lookup provider): one cached fixture fetch answers both the
 * history gate and the teaser, and the worker reuses it from Redis.
 */
async function rpcChainPrecheck(
  chain: RiskChainId,
  address: string,
): Promise<{ history: boolean; fixtures: RpcFixtures }> {
  const fixtures = await fetchChainFixtures(chain, address, getRedis());
  return { history: rpcFixturesHaveHistory(fixtures), fixtures };
}

function rpcTeaser(address: string, fixtures: RpcFixtures): TeaserPayload {
  return {
    address: address.toLowerCase(),
    chain: fixtures.chain,
    native_symbol: RISK_CHAINS[fixtures.chain].nativeSymbol,
    public_stats: teaserStatsFromFixtures(address, fixtures),
    history_present: true,
  };
}

/** Resolve a @handle to a wallet address via the ACP API. null on miss. */
async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://acpx.virtuals.io/api/agents?filters[twitterHandle][$eqi]=${encodeURIComponent(handle)}&pagination[pageSize]=1`,
      { signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!resp.ok) return null;
    const body: any = await resp.json();
    const wallet = body?.data?.[0]?.walletAddress ?? body?.data?.[0]?.wallet_address ?? null;
    return typeof wallet === 'string' && ADDRESS_RE.test(wallet) ? wallet : null;
  } catch {
    return null;
  }
}

interface ResolvedTarget {
  address: string;
  handle?: string;
  input: string;
}

/** Parse + resolve the POST target into a wallet address. Throws INVALID_TARGET on bad input. */
async function resolveTarget(rawTarget: string, chain: RiskChainId): Promise<ResolvedTarget> {
  const target = rawTarget.trim();
  if (target.startsWith('@')) {
    const handle = target.slice(1);
    if (!HANDLE_RE.test(handle)) throw new AppError(400, 'INVALID_TARGET', 'Invalid agent handle');
    if (!RISK_CHAINS[chain].sources.acp) {
      throw new AppError(
        400,
        'INVALID_TARGET',
        `Handles resolve through Virtuals ACP, which is Base-only — paste a 0x address to check on ${RISK_CHAINS[chain].name}`,
      );
    }
    const resolved = await resolveHandle(handle);
    if (!resolved) throw new AppError(400, 'INVALID_TARGET', 'Handle could not be resolved to a wallet');
    return { address: resolved, handle, input: target };
  }
  if (!ADDRESS_RE.test(target)) {
    throw new AppError(400, 'INVALID_TARGET', 'Target must be a 0x address or @handle');
  }
  return { address: target, input: target };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const risk = new Hono();

// POST /api/risk/check — submit a target for a (free) risk check.
// Teaser is cheap (~public_stats); a full decode costs node + Blockscout calls,
// so it gets a tighter per-IP budget.
risk.post(
  '/check',
  rateLimit({ max: 30, windowSec: 60, prefix: 'rl:risk-check' }),
  rateLimit({ max: 8, windowSec: 3600, prefix: 'rl:risk-decode' }),
  async (c) => {
    const json = await c.req.json().catch(() => ({}));
    const parsed = checkBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TARGET', 'Missing or invalid target');
    }
    const { target: rawTarget } = parsed.data;
    const chain: RiskChainId = parsed.data.chain ?? CHAIN;
    let force_recheck = parsed.data.force_recheck ?? false;

    const resolved = await resolveTarget(rawTarget, chain);
    const address = resolved.address.toLowerCase();
    const redis = getRedis();

    // One forced re-check per address per 10 minutes, whoever asks: each one is
    // a full decode, uniquely keyed so it can't coalesce. Inside the window a
    // forced request is served like a normal one (cached report or pending job).
    if (force_recheck) {
      const first = await redis.set(`risk:recheck:${chain}:${address}`, '1', 'EX', 600, 'NX');
      if (first !== 'OK') force_recheck = false;
    }

    // 1. Cache check — a usable cached report short-circuits the decode.
    if (!force_recheck) {
      const cached = await latestReport(address, chain);
      if (cached) {
        const report = rowToReport(cached);
        if (report.freshness.ttl_state === 'fresh') {
          return c.json({ success: true, data: { status: 'ready', report } });
        }
        // Stale: serve free + flagged, with a FREE re-check option.
        return c.json({
          success: true,
          data: { status: 'stale', report, recheck_offer: true },
        });
      }

      // Already-enqueued decode for this novel address → tell the client to poll.
      const pendingId = await redis.get(pendingKey(address, chain));
      if (pendingId) {
        return c.json({ success: true, data: { status: 'queued', check_id: pendingId } }, 202);
      }
    }

    // 2. No usable cached report (or a forced re-check). Gate on history BEFORE enqueue.
    // Chains without Blockscout / a lookup provider (BSC) gate on one cached RPC
    // fixture fetch — nonce, balances, code, and the bounded transfer window.
    let rpcFixtures: RpcFixtures | undefined;
    if (chain !== CHAIN) {
      const pre = await rpcChainPrecheck(chain, address);
      if (!pre.history) {
        return c.json({ success: true, data: { status: 'no_history' } });
      }
      rpcFixtures = pre.fixtures;
    }
    // Blockscout's /counters endpoint is eventually-consistent and intermittently
    // returns 0 for active addresses — especially ERC-4337 smart accounts whose
    // activity is token-transfer / UserOp based (e.g. an agent with 90k+ ACP jobs but
    // few top-level txns). So we declare no_history ONLY when Blockscout AND our own
    // node both show nothing — the node-backed wallet lookup (balances / token
    // holdings / tx list, independent of Blockscout) is the reliable tiebreaker.
    const history = rpcFixtures
      ? { transactions_count: parseInt(rpcFixtures.sentinel_nonce.result, 16) || 0, token_transfers_count: 1 }
      : await checkHistory(address);
    let prefetchedLookup: Awaited<ReturnType<WalletLookupService['lookup']>> | undefined;
    if (!rpcFixtures && history.transactions_count === 0 && history.token_transfers_count === 0) {
      prefetchedLookup = await new WalletLookupService(getRedis()).lookup(address);
      const hasNodeActivity =
        prefetchedLookup.transactions.length > 0 ||
        prefetchedLookup.balances.some((b) => hexToNumber(b.tokenBalance) > 0n);
      if (!hasNodeActivity) {
        return c.json({ success: true, data: { status: 'no_history' } });
      }
    }

    // 3. Enqueue the full (free) decode. The worker caches a public report.
    const { riskCheck } = getQueues();
    const job = await riskCheck.add(
      'risk-check',
      {
        input: resolved.input,
        walletAddress: resolved.address,
        agentHandle: resolved.handle,
        chain,
        forceRecheck: force_recheck,
      },
      // jobId == check_id the client polls. Coalesce concurrent novel-address
      // submissions onto one job; a forced re-check is uniquely keyed so it always runs.
      {
        jobId: force_recheck ? jobIdFor(address, chain, `recheck-${Date.now()}`) : jobIdFor(address, chain),
      },
    );
    const checkId = job.id ?? jobIdFor(address, chain);
    await redis.set(pendingKey(address, chain), checkId, 'EX', PENDING_TTL_SEC);

    // 4a. Forced re-check, or a re-check of an existing (stale) report → client polls.
    if (force_recheck) {
      return c.json({ success: true, data: { status: 'queued', check_id: checkId } }, 202);
    }

    // 4b. Truly novel address: return a cheap synchronous teaser (NO flags) while
    //     the background decode runs. The teaser is what the user sees immediately.
    if (rpcFixtures) {
      return c.json({ success: true, data: { status: 'teaser', teaser: rpcTeaser(address, rpcFixtures) } });
    }
    const acpAgent = await isAcpAgent(address);
    const teaser = await buildTeaser(address, history.transactions_count, acpAgent, prefetchedLookup);
    return c.json({ success: true, data: { status: 'teaser', teaser } });
  },
);

// GET /api/risk/check/:id — poll a queued decode by job id.
risk.get(
  '/check/:id',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-poll' }),
  async (c) => {
    const id = c.req.param('id');
    if (!id) {
      throw new AppError(400, 'INVALID_TARGET', 'Missing check id');
    }
    const { riskCheck } = getQueues();
    const job = await riskCheck.getJob(id);

    if (!job) {
      // Job removed (completed + reaped) — fall back to the cached report.
      // Recover the address + chain from our jobId convention.
      const parsedId = parseJobId(id);
      if (parsedId) {
        const cached = await latestReport(parsedId.address, parsedId.chain);
        if (cached) {
          return c.json({ success: true, data: { status: 'ready', report: rowToReport(cached) } });
        }
      }
      throw new AppError(404, 'NOT_FOUND', 'No such risk check');
    }

    const state = await job.getState();
    const jobChain = chainSchema.safeParse(job.data.chain);
    if (state === 'completed') {
      const cached = await latestReport(job.data.walletAddress, jobChain.success ? jobChain.data : CHAIN);
      if (cached) {
        return c.json({ success: true, data: { status: 'ready', report: rowToReport(cached) } });
      }
      // Completed but the row was suppressed (e.g. lock-held no-op) — treat as ready-less pending.
      return c.json({ success: true, data: { status: 'pending' } });
    }
    if (state === 'failed') {
      return c.json({
        success: true,
        data: { status: 'failed', error: job.failedReason ?? 'decode failed' },
      });
    }
    return c.json({ success: true, data: { status: 'pending' } });
  },
);

// GET /api/risk/report/:address — public report page. Counts unique daily views. 404 if none.
risk.get(
  '/report/:address',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-report' }),
  async (c) => {
    const parsed = addressSchema.safeParse(c.req.param('address'));
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
    }
    const address = parsed.data.toLowerCase();
    const chainParam = chainSchema.optional().safeParse(c.req.query('chain') || undefined);
    if (!chainParam.success) {
      throw new AppError(400, 'INVALID_QUERY', `Unknown chain; expected one of ${RISK_CHAIN_IDS.join(', ')}`);
    }
    const chain: RiskChainId = chainParam.data ?? CHAIN;
    const cached = await latestReport(address, chain);
    if (!cached) {
      throw new AppError(404, 'NOT_FOUND', 'No risk report for this address');
    }

    // Count a view once per visitor IP per address per day, and only for
    // requests that came through Cloudflare: the web server's own SSR/OG fetches
    // carry no CF-Connecting-IP and used to bump the public count on every render.
    // Best-effort; a failed bump never blocks the read.
    let counted = false;
    const visitorIp = c.req.header('cf-connecting-ip');
    if (visitorIp) {
      const firstView = await getRedis()
        .set(`risk:view:${chain}:${address}:${visitorIp}`, '1', 'EX', 86_400, 'NX')
        .catch(() => null);
      if (firstView === 'OK') {
        counted = await getDb()
          .update(riskReports)
          .set({ viewCount: sql`${riskReports.viewCount} + 1` })
          .where(eq(riskReports.id, cached.id))
          .then(() => true)
          .catch((err) => {
            logger.warn({ err, id: cached.id }, 'view_count bump failed');
            return false;
          });
      }
    }

    // A re-check files a new row, so the newest report starts at 0 views and
    // without an attestation until the sweep re-attests it. Show the address's
    // total views, and carry the previous report's attestation forward, labelled.
    const db = getDb();
    const [agg] = (await db.execute(sql`
      SELECT COALESCE(SUM(view_count), 0)::int AS views
      FROM risk_reports
      WHERE lower(wallet_address) = ${address} AND chain = ${chain}
    `)) as unknown as Array<{ views: number }>;
    const totalViews = (agg?.views ?? cached.viewCount) + (counted ? 1 : 0);
    const report = rowToReport({ ...cached, viewCount: totalViews });
    // Attestation is Base-only (EAS); off-base there is nothing to carry forward.
    if (!report.attestation && RISK_CHAINS[chain].sources.attestation) {
      const [prev] = await db
        .select()
        .from(riskReports)
        .where(
          and(
            sql`lower(${riskReports.walletAddress}) = ${address}`,
            eq(riskReports.chain, chain),
            sql`${riskReports.attestationUid} IS NOT NULL`,
          ),
        )
        .orderBy(desc(riskReports.generatedAt))
        .limit(1);
      if (prev) report.attestation = { ...attestationInfo(prev), from_previous_report: true };
    }
    return c.json({ success: true, data: { report } });
  },
);

// GET /api/risk/attestation/:address — the latest EAS attestation ChainWard has
// published on Base for this address, with the exact canonical JSON so anyone
// can recompute reportHash. 404 if the address has never been attested.
risk.get(
  '/attestation/:address',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-attestation' }),
  async (c) => {
    const parsed = addressSchema.safeParse(c.req.param('address'));
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
    }
    const address = parsed.data.toLowerCase();
    const rows = await getDb()
      .select()
      .from(riskReports)
      .where(
        and(
          sql`lower(${riskReports.walletAddress}) = ${address}`,
          eq(riskReports.chain, CHAIN),
          sql`${riskReports.attestationUid} IS NOT NULL`,
        ),
      )
      .orderBy(desc(riskReports.attestedAt))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'No ChainWard attestation for this address');
    }

    const assessment = row.riskAssessment as RiskAssessment;
    const attestable = {
      address: row.walletAddress,
      chain: row.chain,
      asOfBlock: row.asOfBlock,
      classifierVersion: row.classifierVersion,
      assessment,
    };
    return c.json({
      success: true,
      data: {
        address,
        band: assessment.band,
        flag_ids: assessment.flags.map((f) => f.id),
        as_of_block: row.asOfBlock,
        ...attestationInfo(row),
        report_uri: reportUri(address),
        report_hash: reportHash(attestable),
        canonical_json: canonicalReportJson(attestable),
        disclaimer: DISCLAIMER,
      },
    });
  },
);

// GET /api/risk/x402?address= (or /x402/:address) — the paid check (x402, USDC on Base; the payment
// middleware in lib/x402.ts runs first). Answers with a report no older than the
// TTL, running a fresh decode when needed. Any >= 400 response cancels
// settlement, so a check that fails or times out is never charged.
const PAID_WAIT_MS = parseInt(process.env.X402_CHECK_WAIT_MS ?? '55000', 10);

async function paidCheck(c: Context, rawAddress: string | undefined) {
  const parsed = addressSchema.safeParse(rawAddress);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
  }
  const address = parsed.data.toLowerCase();
  // ?chain=bsc checks a BNB Chain address; payment is still USDC on Base.
  const chainParsed = chainSchema.safeParse(c.req.query('chain') ?? CHAIN);
  if (!chainParsed.success) {
    throw new AppError(400, 'INVALID_CHAIN', `chain must be one of: ${RISK_CHAIN_IDS.join(', ')}`);
  }
  const chain: RiskChainId = chainParsed.data;

  const cached = await latestReport(address, chain);
  if (cached && computeTtlState(cached) === 'fresh') {
    return c.json({ success: true, data: { status: 'ready', report: rowToReport(cached) } });
  }

  if (chain !== CHAIN) {
    const pre = await rpcChainPrecheck(chain, address);
    if (!pre.history) {
      return c.json({ success: true, data: { status: 'no_history', address, chain, disclaimer: DISCLAIMER } });
    }
  } else {
    const history = await checkHistory(address);
    if (history.transactions_count === 0 && history.token_transfers_count === 0) {
      const lookup = await new WalletLookupService(getRedis()).lookup(address);
      const active =
        lookup.transactions.length > 0 || lookup.balances.some((b) => hexToNumber(b.tokenBalance) > 0n);
      if (!active) {
        return c.json({ success: true, data: { status: 'no_history', address, disclaimer: DISCLAIMER } });
      }
    }
  }

  const started = Date.now();
  const { riskCheck } = getQueues();
  const job = await riskCheck.add(
    'risk-check',
    { input: address, walletAddress: address, chain, forceRecheck: true },
    { jobId: jobIdFor(address, chain, `x402-${started}`) },
  );

  while (Date.now() - started < PAID_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    const state = await job.getState();
    if (state === 'failed') break;
    if (state === 'completed') {
      const fresh = await latestReport(address, chain);
      if (fresh && new Date(fresh.generatedAt).getTime() >= started - 5_000) {
        return c.json({ success: true, data: { status: 'ready', report: rowToReport(fresh) } });
      }
      break;
    }
  }
  logger.warn({ address, chain, jobId: job.id }, 'x402 check did not finish in time; not charged');
  throw new AppError(504, 'CHECK_TIMEOUT', 'The check did not finish in time. You were not charged; retry shortly.');
}

// GET /api/risk/seller-demand?address= — the paid x402 seller check (services/
// sellerDemandService.ts). Where the address's buyers get their USDC. Cached an
// hour; a check that runs out of time returns 504, which cancels settlement.
const DEMAND_CACHE_SEC = 3600;
const DEMAND_BUDGET_MS = 50_000;

/** eth_blockNumber on an Alchemy RPC; a JSON-RPC error (e.g. network not enabled) becomes a thrown Error. */
export async function rpcHead(rpcUrl: string): Promise<bigint> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error || typeof body.result !== 'string') {
    throw new Error(`eth_blockNumber: ${body.error?.message ?? 'no result'}`);
  }
  return BigInt(body.result);
}

const sellerChainSchema = z.enum(['base', 'bsc']).default('base');

/** The Alchemy RPC for a chain's seller check; BNB is derived from the Base URL unless set explicitly. */
export function sellerDemandRpcUrl(chain: SellerChain, env: NodeJS.ProcessEnv): string | undefined {
  const base = env.SELLER_DEMAND_RPC_URL ?? env.BASE_RPC_URL;
  if (!base || !/alchemy\.com/.test(base)) return undefined;
  if (chain === 'base') return base;
  if (env.SELLER_DEMAND_BSC_RPC_URL) return env.SELLER_DEMAND_BSC_RPC_URL;
  // Only a Base Alchemy host can be rewritten; anything else would silently run the check on the wrong chain.
  const derived = base.replace('base-mainnet', 'bnb-mainnet');
  return derived === base ? undefined : derived;
}

/** Alchemy answers this when the network isn't switched on for the app in its dashboard. */
export function isAlchemyNetworkDisabled(err: unknown): boolean {
  return err instanceof Error && /is not enabled for this app/i.test(err.message);
}

async function sellerDemandCheck(c: Context) {
  const parsed = addressSchema.safeParse(c.req.query('address'));
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
  }
  const chainParsed = sellerChainSchema.safeParse(c.req.query('chain') ?? undefined);
  if (!chainParsed.success) {
    throw new AppError(400, 'INVALID_TARGET', 'chain must be base or bsc');
  }
  const chain = chainParsed.data;
  const address = parsed.data.toLowerCase();
  const redis = getRedis();
  const cacheKey = chain === 'base' ? `seller-demand:${address}` : `seller-demand:${chain}:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: JSON.parse(cached) });

  // alchemy_getAssetTransfers is Alchemy-only; self-hosters point this at an Alchemy URL.
  const rpcUrl = sellerDemandRpcUrl(chain, process.env);
  if (!rpcUrl) {
    throw new AppError(503, 'UNAVAILABLE', 'Seller check needs an Alchemy RPC');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError(504, 'CHECK_TIMEOUT', 'The check did not finish in time. You were not charged; retry shortly.')), DEMAND_BUDGET_MS);
  });
  try {
    const head = await rpcHead(rpcUrl);
    const fromBlock = head - BigInt(DEMAND_WINDOW_DAYS * SELLER_BLOCKS_PER_DAY[chain]);
    const source = alchemyTransferSource(rpcUrl, fromBlock, logger, SELLER_STABLECOINS[chain]);
    const report = await Promise.race([analyzeSellerDemand(address, source), timeout]);
    const data = { ...report, chain };
    await redis.set(cacheKey, JSON.stringify(data), 'EX', DEMAND_CACHE_SEC);
    return c.json({ success: true, data });
  } catch (err) {
    if (isAlchemyNetworkDisabled(err)) {
      logger.warn({ err, chain }, 'seller check: Alchemy network not enabled for this app');
      throw new AppError(503, 'UNAVAILABLE', `Seller check is not available on ${chain} yet`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

risk.get('/seller-demand', rateLimit({ max: 30, windowSec: 60, prefix: 'rl:risk-seller-demand' }), sellerDemandCheck);

const paidRateLimit = rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-x402' });
risk.get('/x402', paidRateLimit, (c) => paidCheck(c, c.req.query('address')));
risk.get('/x402/:address', paidRateLimit, (c) => paidCheck(c, c.req.param('address')));

// GET /api/risk/library?sort=recent&limit=&offset= — the public, SEO-indexed library.
risk.get(
  '/library',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-library' }),
  async (c) => {
    const parsed = librarySchema.safeParse({
      sort: c.req.query('sort'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      distinct: c.req.query('distinct'),
      chain: c.req.query('chain') || undefined,
    });
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_QUERY', 'Invalid library query');
    }
    const { limit, offset, distinct, chain } = parsed.data;
    const db = getDb();
    const publicFilter = chain
      ? and(eq(riskReports.isPublic, true), eq(riskReports.chain, chain))
      : eq(riskReports.isPublic, true);

    if (distinct === 'address') {
      // One card per (address, chain) — its latest filing. DISTINCT ON requires
      // the leading ORDER BY to match the distinct key, so the recency sort
      // happens on the outer select. (walletAddress is canonical-lowercase at
      // insert.) The same address checked on two chains is two filings.
      const latest = db
        .selectDistinctOn([riskReports.walletAddress, riskReports.chain])
        .from(riskReports)
        .where(publicFilter)
        .orderBy(riskReports.walletAddress, riskReports.chain, desc(riskReports.generatedAt))
        .as('latest');
      const rows = await db
        .select()
        .from(latest)
        .orderBy(desc(latest.generatedAt))
        .limit(limit)
        .offset(offset);

      // "Filed N×" — total public filings per returned (address, chain).
      const addresses = rows.map((r) => r.walletAddress);
      const filingCounts = new Map<string, number>();
      if (addresses.length > 0) {
        const countRows = await db
          .select({
            addr: riskReports.walletAddress,
            chain: riskReports.chain,
            n: sql<number>`count(*)::int`,
          })
          .from(riskReports)
          .where(and(publicFilter, inArray(riskReports.walletAddress, addresses)))
          .groupBy(riskReports.walletAddress, riskReports.chain);
        for (const r of countRows) filingCounts.set(`${r.chain}:${r.addr}`, r.n);
      }

      const totalRows = await db
        .select({ total: sql<number>`count(distinct (${riskReports.walletAddress}, ${riskReports.chain}))::int` })
        .from(riskReports)
        .where(publicFilter);
      const total = totalRows[0]?.total ?? 0;

      return c.json({
        success: true,
        data: {
          reports: rows.map((row) => ({
            ...rowToCard(row),
            report_count: filingCounts.get(`${row.chain}:${row.walletAddress}`) ?? 1,
          })),
          pagination: { limit, offset, total },
        },
      });
    }

    const rows = await db
      .select()
      .from(riskReports)
      .where(publicFilter)
      .orderBy(desc(riskReports.generatedAt))
      .limit(limit)
      .offset(offset);

    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(riskReports)
      .where(publicFilter);
    const total = countRows[0]?.total ?? 0;

    return c.json({
      success: true,
      data: {
        reports: rows.map(rowToCard),
        pagination: { limit, offset, total },
      },
    });
  },
);

export { risk };
