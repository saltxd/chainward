import { Hono } from 'hono';
import { getBaseClient } from '../lib/viem.js';
import { logger } from '../lib/logger.js';

const telemetry = new Hono();

interface Snapshot {
  sentinelTip: number | null;
  baseTip: number | null;
  lag: number | null;
  status: 'online' | 'syncing' | 'degraded' | 'offline';
  checkedAt: string;
}

let cache: { data: Snapshot; expiresAt: number } | null = null;
const TTL_MS = 10_000;

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

telemetry.get('/', async (c) => {
  if (cache && cache.expiresAt > Date.now()) {
    return c.json({ success: true, data: cache.data });
  }

  const [sentinelTip, baseTip] = await Promise.all([fetchSentinelTip(), fetchBlockscoutTip()]);

  let status: Snapshot['status'] = 'offline';
  let lag: number | null = null;

  if (sentinelTip !== null && baseTip !== null) {
    lag = baseTip - sentinelTip;
    if (lag <= 5) status = 'online';
    else if (lag <= 500) status = 'syncing';
    else status = 'degraded';
  } else if (sentinelTip !== null) {
    status = 'degraded'; // sentinel up but blockscout failed
  } else if (baseTip !== null) {
    status = 'offline';
  }

  const data: Snapshot = {
    sentinelTip,
    baseTip,
    lag,
    status,
    checkedAt: new Date().toISOString(),
  };

  cache = { data, expiresAt: Date.now() + TTL_MS };
  return c.json({ success: true, data });
});

export { telemetry };
