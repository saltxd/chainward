import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { formatEther, formatUnits } from 'viem';
import { riskReports } from '@chainward/db';
import { CLASSIFIER_VERSION, type QuickDecodeResultData, type RiskAssessment } from '@chainward/decode';
import { KNOWN_CONTRACTS } from '@chainward/common';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { getQueues } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { WalletLookupService } from '../services/walletLookupService.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN = 'base';
const USDC_ADDRESS = KNOWN_CONTRACTS.base.USDC.toLowerCase();

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
});

const librarySchema = z.object({
  sort: z.enum(['recent']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
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
  classifier_version: string;
  view_count: number;
  disclaimer: string;
}

interface TeaserPayload {
  address: string;
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

interface ReportCard {
  address: string;
  agent_name?: string;
  band: string;
  flag_count: number;
  top_severity: string | null;
  as_of_date: string;
  view_count: number;
  report_url: string;
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
    classifier_version: row.classifierVersion,
    view_count: row.viewCount,
    disclaimer: DISCLAIMER,
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

function rowToCard(row: RiskReportRow): ReportCard {
  return {
    address: row.walletAddress,
    agent_name: row.agentName ?? undefined,
    band: row.band,
    flag_count: row.flagCount,
    top_severity: topSeverity(row),
    as_of_date: new Date(row.generatedAt).toISOString(),
    view_count: row.viewCount,
    report_url: `/risk/report/${row.walletAddress}`,
  };
}

/** Most recent report for an address+chain, or undefined. */
async function latestReport(address: string): Promise<RiskReportRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(riskReports)
    .where(and(sql`lower(${riskReports.walletAddress}) = ${address.toLowerCase()}`, eq(riskReports.chain, CHAIN)))
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
): Promise<TeaserPayload> {
  const lookup = await new WalletLookupService(getRedis()).lookup(address);

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

function pendingKey(address: string): string {
  return `risk:pending:${address.toLowerCase()}`;
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
async function resolveTarget(rawTarget: string): Promise<ResolvedTarget> {
  const target = rawTarget.trim();
  if (target.startsWith('@')) {
    const handle = target.slice(1);
    if (!HANDLE_RE.test(handle)) throw new AppError(400, 'INVALID_TARGET', 'Invalid agent handle');
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
    const { target: rawTarget, force_recheck = false } = parsed.data;

    const resolved = await resolveTarget(rawTarget);
    const address = resolved.address.toLowerCase();
    const redis = getRedis();

    // 1. Cache check — a usable cached report short-circuits the decode.
    if (!force_recheck) {
      const cached = await latestReport(address);
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
      const pendingId = await redis.get(pendingKey(address));
      if (pendingId) {
        return c.json({ success: true, data: { status: 'queued', check_id: pendingId } }, 202);
      }
    }

    // 2. No usable cached report (or a forced re-check). Gate on history BEFORE enqueue.
    const history = await checkHistory(address);
    if (history.transactions_count === 0 && history.token_transfers_count === 0) {
      return c.json({ success: true, data: { status: 'no_history' } });
    }

    // 3. Enqueue the full (free) decode. The worker caches a public report.
    const { riskCheck } = getQueues();
    const job = await riskCheck.add(
      'risk-check',
      {
        input: resolved.input,
        walletAddress: resolved.address,
        agentHandle: resolved.handle,
        chain: CHAIN,
        forceRecheck: force_recheck,
      },
      // jobId == check_id the client polls. Coalesce concurrent novel-address
      // submissions onto one job; a forced re-check is uniquely keyed so it always runs.
      {
        jobId: force_recheck
          ? `risk-${address}-recheck-${Date.now()}`
          : `risk-${address}`,
      },
    );
    const checkId = job.id ?? `risk-${address}`;
    await redis.set(pendingKey(address), checkId, 'EX', PENDING_TTL_SEC);

    // 4a. Forced re-check, or a re-check of an existing (stale) report → client polls.
    if (force_recheck) {
      return c.json({ success: true, data: { status: 'queued', check_id: checkId } }, 202);
    }

    // 4b. Truly novel address: return a cheap synchronous teaser (NO flags) while
    //     the background decode runs. The teaser is what the user sees immediately.
    const acpAgent = await isAcpAgent(address);
    const teaser = await buildTeaser(address, history.transactions_count, acpAgent);
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
      // Recover the address from our jobId convention `risk-<addr>[-recheck-...]`.
      const m = id.match(/^risk-(0x[a-fA-F0-9]{40})/);
      if (m?.[1]) {
        const cached = await latestReport(m[1]);
        if (cached) {
          return c.json({ success: true, data: { status: 'ready', report: rowToReport(cached) } });
        }
      }
      throw new AppError(404, 'NOT_FOUND', 'No such risk check');
    }

    const state = await job.getState();
    if (state === 'completed') {
      const cached = await latestReport(job.data.walletAddress);
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

// GET /api/risk/report/:address — public report page. Increments view_count. 404 if none.
risk.get(
  '/report/:address',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-report' }),
  async (c) => {
    const parsed = addressSchema.safeParse(c.req.param('address'));
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
    }
    const address = parsed.data.toLowerCase();
    const cached = await latestReport(address);
    if (!cached) {
      throw new AppError(404, 'NOT_FOUND', 'No risk report for this address');
    }

    // Increment view_count (best-effort; a failed bump never blocks the read).
    const db = getDb();
    await db
      .update(riskReports)
      .set({ viewCount: sql`${riskReports.viewCount} + 1` })
      .where(eq(riskReports.id, cached.id))
      .catch((err) => logger.warn({ err, id: cached.id }, 'view_count bump failed'));

    const report = rowToReport({ ...cached, viewCount: cached.viewCount + 1 });
    return c.json({ success: true, data: { report } });
  },
);

// GET /api/risk/library?sort=recent&limit=&offset= — the public, SEO-indexed library.
risk.get(
  '/library',
  rateLimit({ max: 60, windowSec: 60, prefix: 'rl:risk-library' }),
  async (c) => {
    const parsed = librarySchema.safeParse({
      sort: c.req.query('sort'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_QUERY', 'Invalid library query');
    }
    const { limit, offset } = parsed.data;
    const db = getDb();

    const rows = await db
      .select()
      .from(riskReports)
      .where(eq(riskReports.isPublic, true))
      .orderBy(desc(riskReports.generatedAt))
      .limit(limit)
      .offset(offset);

    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(riskReports)
      .where(eq(riskReports.isPublic, true));
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
