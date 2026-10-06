import 'dotenv/config';
import { serve } from '@hono/node-server';
import { getEnv } from './config.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { getWebhookProvider } from './providers/index.js';
import { x402CheckMiddleware } from './lib/x402.js';
// Observatory cache warming has been removed from the API process to keep the
// /api/livez event loop unconditionally responsive. The warmer ran every 5min
// and did periodic CPU work (drizzle row materialization, JSON serialization)
// that, even at small payload sizes, kept this process from being a true
// "request-only" handler — a class of cause for external prober flaps that we
// kept chasing through partial fixes. Future warming should live in a
// separate K8s CronJob or in the indexer pod. See memory:
// chainward-flap-root-cause.

// Validate env on startup
const env = getEnv();
getWebhookProvider().init();

const app = createApp({ corsOrigins: env.CORS_ORIGINS.split(','), x402Check: x402CheckMiddleware() });

// Catch unhandled errors so the process doesn't die silently
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

// Start server
const port = env.PORT;
logger.info({ port, env: env.NODE_ENV }, 'Starting ChainWard API');

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`ChainWard API running on http://localhost:${info.port}`);
});

export default app;
