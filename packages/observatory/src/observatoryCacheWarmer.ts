import type { Database } from '@chainward/db';
import type IORedis from 'ioredis';
import { ObservatoryService } from './observatoryService.js';

// 5-minute interval gives plenty of buffer under the shortest cache TTL (300s
// for /feed and /overview), but doesn't keep the DB pool warm continuously.
// Each cycle is sequential (see ObservatoryService.refreshAll) so total
// duration is roughly the sum of per-endpoint compute, typically 30-50s, then
// the pool is idle for ~4 minutes before the next cycle.
const WARM_INTERVAL_MS = 300_000;

// Minimal structural logger interface so this package can be invoked from
// either the api or indexer (both use pino but we don't want a hard runtime
// dep here).
export interface WarmerLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface ObservatoryCacheWarmerOptions {
  db: Database;
  redis: IORedis;
  logger: WarmerLogger;
  /** Override the warm interval (default: 300_000 ms). */
  intervalMs?: number;
}

export interface ObservatoryCacheWarmerHandle {
  stop: () => void;
}

export function startObservatoryCacheWarmer(
  opts: ObservatoryCacheWarmerOptions,
): ObservatoryCacheWarmerHandle {
  const { db, redis, logger } = opts;
  const intervalMs = opts.intervalMs ?? WARM_INTERVAL_MS;
  const service = new ObservatoryService(db, redis);

  const run = async () => {
    const start = Date.now();
    try {
      await service.refreshAll();
      logger.info({ durationMs: Date.now() - start }, 'observatory cache warmer ok');
    } catch (err) {
      logger.error({ err, durationMs: Date.now() - start }, 'observatory cache warmer failed');
    }
  };

  // Fire immediately so cache is hot on cold start, then on interval.
  void run();
  const timer = setInterval(() => void run(), intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
