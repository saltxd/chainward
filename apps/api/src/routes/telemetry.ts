import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getBaseClient } from '../lib/viem.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const telemetry = new Hono();

type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

interface Snapshot {
  sentinelTip: number | null;
  baseTip: number | null;
  sentinelLag: number | null;
  sentinelStatus: SignalStatus;
  indexerLastTxAt: string | null;
  indexerLagSeconds: number | null;
  indexerStatus: SignalStatus;
  checkedAt: string;

  // Back-compat aliases — the status-ticker reads these for the "sentinel" pill
  lag: number | null;
  status: SignalStatus;
}

let cache: { data: Snapshot; expiresAt: number } | null = null;
const TTL_MS = 10_000;

// Indexer thresholds (seconds)
const INDEXER_ONLINE_THRESHOLD = 5 * 60;      // <5 min  — fresh
const INDEXER_SYNCING_THRESHOLD = 30 * 60;    // <30 min — mildly stale
// Over 30 min is degraded; over 6h it's offline
const INDEXER_OFFLINE_THRESHOLD = 6 * 60 * 60;

async function fetchBlockscoutTip(): Promise<number | null> {
  try {
    const res = await fetch('https://base.blockscout.com/api/v2/main-page/blocks', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ height: number }>;
    return json?.[0]?.height ?? null;
  } catch (err) {
    logger.debug({ err }, 'blockscout tip fetch failed');
    return null;
  }
}

async function fetchSentinelTip(): Promise<number | null> {
  try {
    const client = getBaseClient();
    const block = await client.getBlockNumber();
    return Number(block);
  } catch (err) {
    logger.debug({ err }, 'sentinel tip fetch failed');
    return null;
  }
}

async function fetchIndexerLastTx(): Promise<Date | null> {
  try {
    const db = getDb();
    const rows = (await db.execute(
      sql`SELECT MAX(timestamp) AS last_tx FROM transactions`,
    )) as unknown as Array<{ last_tx: string | null }>;
    const raw = rows[0]?.last_tx ?? null;
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (err) {
    logger.debug({ err }, 'indexer last tx query failed');
    return null;
  }
}

function deriveSentinelStatus(lag: number | null): SignalStatus {
  if (lag === null) return 'offline';
  if (lag <= 5) return 'online';
  if (lag <= 500) return 'syncing';
  return 'degraded';
}

function deriveIndexerStatus(lagSeconds: number | null): SignalStatus {
  if (lagSeconds === null) return 'offline';
  if (lagSeconds <= INDEXER_ONLINE_THRESHOLD) return 'online';
  if (lagSeconds <= INDEXER_SYNCING_THRESHOLD) return 'syncing';
  if (lagSeconds <= INDEXER_OFFLINE_THRESHOLD) return 'degraded';
  return 'offline';
}

telemetry.get('/', async (c) => {
  if (cache && cache.expiresAt > Date.now()) {
    return c.json({ success: true, data: cache.data });
  }

  const [sentinelTip, baseTip, indexerLastTx] = await Promise.all([
    fetchSentinelTip(),
    fetchBlockscoutTip(),
    fetchIndexerLastTx(),
  ]);

  const sentinelLag =
    sentinelTip !== null && baseTip !== null ? baseTip - sentinelTip : null;

  // If blockscout failed but sentinel is up, we can't compute lag — treat as degraded.
  let sentinelStatus: SignalStatus;
  if (sentinelTip === null) sentinelStatus = 'offline';
  else if (baseTip === null) sentinelStatus = 'degraded';
  else sentinelStatus = deriveSentinelStatus(sentinelLag);

  const indexerLagSeconds = indexerLastTx
    ? Math.max(0, Math.floor((Date.now() - indexerLastTx.getTime()) / 1000))
    : null;
  const indexerStatus = deriveIndexerStatus(indexerLagSeconds);

  const data: Snapshot = {
    sentinelTip,
    baseTip,
    sentinelLag,
    sentinelStatus,
    indexerLastTxAt: indexerLastTx ? indexerLastTx.toISOString() : null,
    indexerLagSeconds,
    indexerStatus,
    checkedAt: new Date().toISOString(),
    lag: sentinelLag,
    status: sentinelStatus,
  };

  cache = { data, expiresAt: Date.now() + TTL_MS };
  return c.json({ success: true, data });
});

export { telemetry };
