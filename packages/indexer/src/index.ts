import { getEnv } from './config.js';
import { logger } from './lib/logger.js';
import { getRedis } from './lib/redis.js';
import { createBaseIndexerWorker } from './workers/baseIndexer.js';
import { createBalancePollerWorker, setupBalancePolling } from './workers/balancePoller.js';
import { createAlertEvaluatorWorker, setupAlertSchedule } from './workers/alertEvaluator.js';
import { createAlertDeliveryWorker } from './workers/alertDelivery.js';
import { createIntelligenceWorker, setupIntelligenceSchedule } from './workers/intelligence.js';
import { createRegistryScoutWorker, setupRegistryScoutSchedule } from './workers/registryScout.js';
import { createAcpSyncWorker, setupAcpSyncSchedule } from './workers/acpSync.js';
import { createDigestWorker, setupDigestSchedule } from './workers/digestGenerator.js';
import { createAcpWalletTracerWorker, setupAcpWalletTracerSchedule } from './workers/acpWalletTracer.js';

// Validate env on startup
getEnv();

logger.info('Starting ChainWard indexer workers');

// Start workers
const baseIndexer = createBaseIndexerWorker();
const balancePoller = createBalancePollerWorker();
const alertEvaluator = createAlertEvaluatorWorker();
const alertDelivery = createAlertDeliveryWorker();
const intelligence = createIntelligenceWorker();
const registryScout = createRegistryScoutWorker();
const acpSync = createAcpSyncWorker();
const digest = createDigestWorker();
const acpTracer = createAcpWalletTracerWorker();

// Set up repeatable jobs
const redis = getRedis();
await setupBalancePolling(redis);
await setupAlertSchedule(redis);
await setupIntelligenceSchedule(redis);
await setupRegistryScoutSchedule(redis);
await setupAcpSyncSchedule(redis);
await setupDigestSchedule(redis);
await setupAcpWalletTracerSchedule(redis);

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down workers');
  await Promise.all([
    baseIndexer.close(),
    balancePoller.close(),
    alertEvaluator.close(),
    alertDelivery.close(),
    intelligence.close(),
    registryScout.close(),
    acpSync.close(),
    digest.close(),
    acpTracer.close(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors so workers don't die silently
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection in indexer');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception in indexer — shutting down');
  process.exit(1);
});

logger.info('All indexer workers running');
