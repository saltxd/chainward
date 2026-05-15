import { ObservatoryService } from '../services/observatoryService.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const WARM_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

export function startObservatoryCacheWarmer(): void {
  if (timer) return;
  const service = new ObservatoryService(getDb(), getRedis());

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
  timer = setInterval(() => void run(), WARM_INTERVAL_MS);
}

export function stopObservatoryCacheWarmer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
