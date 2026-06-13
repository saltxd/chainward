import { Worker, type Job } from 'bullmq';
import {
  computeQuickDecodeData,
  deriveRiskFlags,
  fetchFixtures,
  type RiskFlag,
} from '@chainward/decode';
import { riskReports } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const PIPELINE_VERSION = process.env.GIT_SHA ?? 'dev';

// Mirrors the acp-decoder config defaults so the live-fetch path behaves
// identically in both pods. Read from env at call time (no new required vars).
const SENTINEL_RPC = process.env.SENTINEL_RPC ?? 'https://mainnet.base.org';
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS ?? '15000', 10);
// Watchdog: the whole decode (fetch + classify + persist) must finish inside this
// budget or the job fails — mirrors apps/acp-decoder/src/handler.ts decodeWatchdogMs.
const RISK_WATCHDOG_MS = parseInt(process.env.RISK_DECODE_WATCHDOG_MS ?? '120000', 10);
// How long the per-target lock is held. Long enough to cover a full decode,
// short enough that a crashed worker doesn't wedge an address indefinitely.
const LOCK_TTL_MS = parseInt(process.env.RISK_LOCK_TTL_MS ?? '180000', 10);
// Coarse time bucket so concurrent requests for the same address coalesce onto a
// single in-flight decode rather than racing N identical live fetches.
const AS_OF_BUCKET_MS = parseInt(process.env.RISK_AS_OF_BUCKET_MS ?? '60000', 10);

export interface RiskCheckJobData {
  /** The raw target the user submitted ("0x..." or "@handle"). */
  input: string;
  /** Resolved 0x wallet address (handles are resolved by the API before enqueue). */
  walletAddress: string;
  /** Bare handle without @, when the target was a handle. */
  agentHandle?: string;
  chain?: string;
  /** Forced re-check requested by the user — bypasses cache (cache check is the API's job). */
  forceRecheck?: boolean;
}

/** Severity rank for picking the denormalized `top_flags` card preview. */
const SEVERITY_RANK: Record<RiskFlag['severity'], number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function timeoutAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

/**
 * The risk-check worker. Produces a forensic on-chain risk report WITHOUT the
 * LLM prose step (flags are pure over the classifier output), then caches it as
 * a public risk_reports row. The job id == the API's check_id used for polling.
 */
export function createRiskCheckWorker() {
  const worker = new Worker<RiskCheckJobData>(
    'risk-check',
    async (job: Job<RiskCheckJobData>) => {
      const result = await Promise.race([
        runRiskCheck(job),
        timeoutAfter(RISK_WATCHDOG_MS, '__watchdog__' as const),
      ]);
      if (result === '__watchdog__') {
        // Surface as a job failure so GET /api/risk/check/:id reports 'failed'
        // rather than leaving the buyer polling a job that silently hung.
        throw new Error(`risk-check watchdog timeout after ${RISK_WATCHDOG_MS}ms`);
      }
      return result;
    },
    {
      connection: getRedis(),
      // Live fetches are I/O-bound but each hits the node + Blockscout; keep
      // concurrency modest so a burst can't hammer the sentinel node.
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, address: job.data.walletAddress }, 'Risk check completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, address: job?.data.walletAddress, err }, 'Risk check failed');
  });

  logger.info('Risk check worker started');
  return worker;
}

async function runRiskCheck(job: Job<RiskCheckJobData>): Promise<{ persisted: boolean; band: string }> {
  const { input, walletAddress, agentHandle, chain = 'base' } = job.data;
  const redis = getRedis();
  const db = getDb();

  const addr = walletAddress.toLowerCase();
  const bucket = Math.floor(Date.now() / AS_OF_BUCKET_MS);
  const lockKey = `risk:lock:${addr}:${bucket}`;

  // Per-(address, as_of_bucket) lock so concurrent requests for the same wallet
  // coalesce — only one worker does the live fetch + classify per bucket window.
  const acquired = await redis.set(lockKey, job.id ?? '1', 'PX', LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') {
    logger.info({ address: addr, bucket }, 'Risk check lock held; another worker is decoding this target');
    return { persisted: false, band: 'lock-held' };
  }

  try {
    const fixtures = await fetchFixtures(walletAddress, {
      sentinelRpc: SENTINEL_RPC,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
      agentName: agentHandle ? `@${agentHandle}` : undefined,
      logger,
    });

    // Compute the full classifier result WITHOUT the LLM prose step — flags are
    // pure over QuickDecodeResultData, so the hot path never spawns claude.
    const { data, sources, meta } = computeQuickDecodeData({
      input,
      wallet_address: walletAddress,
      job_id: job.id ?? `risk-${addr}`,
      pipeline_version: PIPELINE_VERSION,
      fixtures,
    });

    const assessment = deriveRiskFlags(data);

    // Denormalized card columns: top flags by severity, capped to 3 for the preview.
    const topFlags = [...assessment.flags]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
      .slice(0, 3)
      .map((f) => ({ id: f.id, severity: f.severity, title: f.title }));

    const inserted = await db
      .insert(riskReports)
      .values({
        walletAddress: addr,
        chain,
        asOfBlock: meta.as_of_block.number,
        classifierVersion: assessment.classifier_version,
        band: assessment.band,
        flagCount: assessment.flags.length,
        topFlags,
        agentName: data.target.name ?? null,
        survivalClass: data.survival.classification,
        viewCount: 0,
        reportData: data,
        riskAssessment: assessment,
        sources,
        // report_markdown is intentionally null in v1 — no LLM prose on the hot path.
        reportMarkdown: null,
        isPublic: true,
        generatedAt: new Date(meta.generated_at),
      })
      // Unique key is (lower(address), chain, as_of_block, classifier_version);
      // a concurrent/duplicate decode for the same block+version is a no-op.
      .onConflictDoNothing()
      .returning({ id: riskReports.id });

    logger.info(
      {
        address: addr,
        band: assessment.band,
        flagCount: assessment.flags.length,
        asOfBlock: meta.as_of_block.number,
        persisted: inserted.length > 0,
      },
      'Risk check decoded',
    );

    return { persisted: inserted.length > 0, band: assessment.band };
  } finally {
    // Best-effort lock release; the PX TTL is the backstop if this throws.
    await redis.del(lockKey).catch(() => {});
  }
}
