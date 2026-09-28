import { Worker, Queue, type Job } from 'bullmq';
import {
  alchemyTransferSource,
  analyzeSellerDemand,
  DEMAND_WINDOW_DAYS,
  type SellerDemandReport,
} from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── x402 seller board ────────────────────────────────────────────────────────
//
// Weekly: Base's largest x402 sellers by 7-day volume (x402scan's public
// ranking), each run through the seller check (where do its buyers get their
// USDC?). Stored in Redis for GET /api/x402/board and chainward.ai/x402.
// Needs SELLER_DEMAND_RPC_URL (an Alchemy Base URL); off without it.

const QUEUE = 'x402-board';
const TOP_N = parseInt(process.env.X402_BOARD_SIZE ?? '20', 10);
export const X402_BOARD_LATEST_KEY = 'x402:board:latest';
const HISTORY_TTL_SEC = 90 * 86_400;
const X402SCAN = 'https://www.x402scan.com/api/trpc';
const UA = { 'user-agent': 'chainward-board/1.0 (+https://chainward.ai/x402)' };

interface X402ScanSeller {
  recipient: string;
  tx_count: number;
  total_amount: number;
  unique_buyers: number;
  facilitator_ids: string[];
  latest_block_timestamp: string;
}

export interface BoardRow {
  seller: string;
  label: string | null;
  x402scan_7d: { volume_usd: number; settlements: number; buyers: number; facilitators: string[] };
  report: SellerDemandReport | null;
  error?: string;
}

async function x402scan<T>(procedure: string, input: unknown): Promise<T> {
  const url = `${X402SCAN}/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json()) as { result?: { data: { json: T } }; error?: unknown };
  if (!body.result) throw new Error(`x402scan ${procedure} failed`);
  return body.result.data.json;
}

async function topSellers(): Promise<X402ScanSeller[]> {
  const page = await x402scan<{ items: X402ScanSeller[] }>('public.sellers.all.list', {
    chain: 'base',
    sorting: { id: 'total_amount', desc: true },
    timeframe: 7,
    pagination: { page: 0, page_size: TOP_N },
  });
  return page.items;
}

/** x402scan's origin label for a payTo (its registry's claim, not ours). */
async function originLabel(address: string): Promise<string | null> {
  try {
    const origins = await x402scan<Array<{ origin: string }>>('public.origins.list.origins', { chain: 'base', address });
    return origins[0]?.origin.replace(/^https?:\/\//, '') ?? null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function baseHead(rpcUrl: string): Promise<bigint> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(10_000),
  });
  return BigInt(((await res.json()) as { result: string }).result);
}

export async function buildX402Board(): Promise<Record<string, unknown>> {
  const rpcUrl = process.env.SELLER_DEMAND_RPC_URL;
  if (!rpcUrl) return { skipped: 'no_rpc' };

  const head = await baseHead(rpcUrl);
  const source = alchemyTransferSource(rpcUrl, head - BigInt(DEMAND_WINDOW_DAYS * 43_200), logger);
  const sellers = await topSellers();

  const rows: BoardRow[] = [];
  // One seller at a time: the Alchemy free tier throttles on compute units per second.
  for (const s of sellers) {
    const base = {
      seller: s.recipient.toLowerCase(),
      label: await originLabel(s.recipient),
      x402scan_7d: {
        volume_usd: Math.round(s.total_amount / 1e4) / 100,
        settlements: s.tx_count,
        buyers: s.unique_buyers,
        facilitators: s.facilitator_ids,
      },
    };
    let report: SellerDemandReport | null = null;
    for (let attempt = 1; attempt <= 2 && !report; attempt++) {
      try {
        report = await analyzeSellerDemand(s.recipient, source);
      } catch (err) {
        logger.warn({ seller: s.recipient, attempt, err: (err as Error).message }, 'x402Board: seller check failed');
        if (attempt === 1) await sleep(20_000); // let the compute-unit budget refill
      }
    }
    rows.push(report ? { ...base, report } : { ...base, report: null, error: 'check_failed' });
    await sleep(2_000);
  }

  const board = {
    generated_at: new Date().toISOString(),
    as_of_block: head.toString(),
    ranking: "x402scan's top Base sellers by 7-day volume",
    check_window_days: DEMAND_WINDOW_DAYS,
    rows,
  };
  const redis = getRedis();
  const json = JSON.stringify(board);
  await redis.set(X402_BOARD_LATEST_KEY, json);
  await redis.set(`x402:board:${board.generated_at.slice(0, 10)}`, json, 'EX', HISTORY_TTL_SEC);
  logger.info({ sellers: rows.length, failed: rows.filter((r) => r.error).length }, 'x402Board: board built');
  return { sellers: rows.length };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createX402BoardWorker() {
  return new Worker(QUEUE, async (_job: Job) => buildX402Board(), {
    connection: getRedis(),
    concurrency: 1,
  });
}

export async function setupX402BoardSchedule(redis: import('ioredis').default) {
  const queue = new Queue(QUEUE, { connection: redis });
  for (const job of await queue.getRepeatableJobs()) {
    await queue.removeRepeatableByKey(job.key);
  }
  // Mondays 06:00 UTC, after the weekend's settlements land.
  await queue.add('x402-board-weekly', {}, { repeat: { pattern: '0 6 * * 1', tz: 'UTC' }, jobId: 'x402-board-weekly' });
  if (!(await redis.exists(X402_BOARD_LATEST_KEY))) {
    await queue.add('x402-board-initial', {}, { jobId: `x402-board-initial-${Date.now()}` });
  }
  logger.info('x402 board schedule configured (Mondays 06:00 UTC)');
  await queue.close();
}
