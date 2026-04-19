import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getBaseClient } from '../lib/viem.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const telemetry = new Hono();

type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

interface Snapshot {
  sentinelTip: number | null;
  baseTip: number | null;
  baseTipSource: 'base-public' | 'blockscout' | null;
  sentinelLag: number | null;
  sentinelStatus: SignalStatus;

  indexerHeartbeatAt: string | null;
  indexerHeartbeatAgeSeconds: number | null;
  indexerLastTxAt: string | null;
  indexerLagSeconds: number | null;
  indexerStatus: SignalStatus;

  checkedAt: string;

  // Back-compat aliases
  lag: number | null;
  status: SignalStatus;
}

let cache: { data: Snapshot; expiresAt: number } | null = null;
const TTL_MS = 10_000;

const INDEXER_HEARTBEAT_KEY = 'chainward:indexer:heartbeat';
// Heartbeat is written every 15s. Anything fresher than 45s = healthy.
const INDEXER_HEARTBEAT_ONLINE_SEC = 45;
const INDEXER_HEARTBEAT_DEGRADED_SEC = 120;

async function fetchBasePublicTip(): Promise<number | null> {
  try {
    const res = await fetch('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    if (!json.result) return null;
    const n = parseInt(json.result, 16);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    logger.debug({ err }, 'mainnet.base.org tip fetch failed');
    return null;
  }
}

async function fetchBlockscoutTip(): Promise<number | null> {
  try {
    const res = await fetch('https://base.blockscout.com/api/v2/main-page/blocks', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ height: number }>;
    return json?.[0]?.height ?? null;
  } catch (err) {
    logger.debug({ err }, 'blockscout tip fetch failed');
    return null;
  }
}

async function fetchReferenceTip(): Promise<{
  tip: number | null;
  source: Snapshot['baseTipSource'];
}> {
  const basePublic = await fetchBasePublicTip();
  if (basePublic !== null) return { tip: basePublic, source: 'base-public' };
  const blockscout = await fetchBlockscoutTip();
  if (blockscout !== null) return { tip: blockscout, source: 'blockscout' };
  return { tip: null, source: null };
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

async function fetchIndexerHeartbeat(): Promise<Date | null> {
  try {
    const raw = await getRedis().get(INDEXER_HEARTBEAT_KEY);
    if (!raw) return null;
    const ms = parseInt(raw, 10);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
  } catch (err) {
    logger.debug({ err }, 'indexer heartbeat read failed');
    return null;
  }
}

function deriveSentinelLagStatus(lag: number): SignalStatus {
  if (lag <= 5) return 'online';
  if (lag <= 500) return 'syncing';
  return 'degraded';
}

function deriveIndexerHeartbeatStatus(ageSec: number | null): SignalStatus {
  if (ageSec === null) return 'offline';
  if (ageSec <= INDEXER_HEARTBEAT_ONLINE_SEC) return 'online';
  if (ageSec <= INDEXER_HEARTBEAT_DEGRADED_SEC) return 'degraded';
  return 'offline';
}

telemetry.get('/', async (c) => {
  if (cache && cache.expiresAt > Date.now()) {
    return c.json({ success: true, data: cache.data });
  }

  const [sentinelTip, reference, indexerLastTx, indexerHeartbeat] = await Promise.all([
    fetchSentinelTip(),
    fetchReferenceTip(),
    fetchIndexerLastTx(),
    fetchIndexerHeartbeat(),
  ]);

  const baseTip = reference.tip;
  const sentinelLag = sentinelTip !== null && baseTip !== null ? baseTip - sentinelTip : null;

  // Sentinel is only "degraded/syncing" when we have evidence it's behind.
  // No reference ≠ degraded — our RPC is responding, we just can't verify lag.
  let sentinelStatus: SignalStatus;
  if (sentinelTip === null) sentinelStatus = 'offline';
  else if (sentinelLag === null) sentinelStatus = 'online';
  else sentinelStatus = deriveSentinelLagStatus(sentinelLag);

  const indexerHeartbeatAgeSeconds = indexerHeartbeat
    ? Math.max(0, Math.floor((Date.now() - indexerHeartbeat.getTime()) / 1000))
    : null;
  const indexerStatus = deriveIndexerHeartbeatStatus(indexerHeartbeatAgeSeconds);

  const indexerLagSeconds = indexerLastTx
    ? Math.max(0, Math.floor((Date.now() - indexerLastTx.getTime()) / 1000))
    : null;

  const data: Snapshot = {
    sentinelTip,
    baseTip,
    baseTipSource: reference.source,
    sentinelLag,
    sentinelStatus,

    indexerHeartbeatAt: indexerHeartbeat ? indexerHeartbeat.toISOString() : null,
    indexerHeartbeatAgeSeconds,
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
