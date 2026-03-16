import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { getEnv } from './config.js';
import { health } from './routes/health.js';
import { auth } from './routes/auth.js';
import { agents } from './routes/agents.js';
import { webhooks } from './routes/webhooks.js';
import { stats } from './routes/stats.js';
import { txRoutes } from './routes/transactions.js';
import { balances } from './routes/balances.js';
import { gas } from './routes/gas.js';
import { alerts } from './routes/alerts.js';
import { apiKeysRoute } from './routes/apiKeys.js';
import { wallets } from './routes/wallets.js';
import { publicAgents } from './routes/publicAgents.js';
import { observatory } from './routes/observatory.js';
import { digest } from './routes/digest.js';
import { handleError } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { logger } from './lib/logger.js';
import { getWebhookProvider } from './providers/index.js';

// Validate env on startup
const env = getEnv();
getWebhookProvider().init();

const app = new Hono();

// Global middleware
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS.split(','),
    credentials: true,
  }),
);

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// Error handler
app.onError(handleError);

// Request body size limit (1MB)
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));

// Rate limiting on API routes (100 req/min per client)
app.use('/api/*', rateLimit({ max: 100, windowSec: 60, prefix: 'rl:api' }));

// Routes
app.route('/api/health', health);
app.route('/api/auth', auth);
app.route('/api/agents', agents);
app.route('/api/webhooks', webhooks);
app.route('/api/stats', stats);
app.route('/api/transactions', txRoutes);
app.route('/api/balances', balances);
app.route('/api/gas', gas);
app.route('/api/alerts', alerts);
app.route('/api/keys', apiKeysRoute);
app.route('/api/wallets', wallets);
app.route('/api/public/agents', publicAgents);
app.route('/api/observatory', observatory);
app.route('/api/digest', digest);

// 404 handler
app.notFound((c) =>
  c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);

// Start server
const port = env.PORT;
logger.info({ port, env: env.NODE_ENV }, 'Starting ChainWard API');

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`ChainWard API running on http://localhost:${info.port}`);
});

export default app;
