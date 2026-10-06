import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
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
import { publicDecodes } from './routes/publicDecodes.js';
import { risk } from './routes/risk.js';
import { observatory } from './routes/observatory.js';
import { digest } from './routes/digest.js';
import { payments } from './routes/payments.js';
import { brief } from './routes/brief.js';
import { telemetry } from './routes/telemetry.js';
import { x402Board } from './routes/x402Board.js';
import { setAndEarnBoard } from './routes/setAndEarnBoard.js';
import { paid, requireKnownSlug } from './routes/paid.js';
import { handleError } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { logger } from './lib/logger.js';
import { apiHomePage, x402DiscoveryDocument, x402OpenApiDocument, x402PublicUrl } from './lib/x402.js';
import { checkPaidInput, parseCounterpartyInput, parseHireInput, parseSellerInput } from './lib/paidInput.js';

export interface AppOptions {
  /** Origins allowed to make credentialed cross-origin requests. */
  corsOrigins: string[];
  /** The x402 payment middleware, or null when no receiving address is configured. */
  x402Check: MiddlewareHandler | null;
}

/** The API's Hono app: every middleware and route, with no server, env or process hooks. */
export function createApp({ corsOrigins, x402Check }: AppOptions): Hono {
  const app = new Hono();

  // Liveness probes — registered before any middleware so they cannot be blocked
  // by auth, body parsing, rate limiting, or DB/Redis stalls.
  //   /livez       → in-cluster Kubernetes probes (not exposed via ingress)
  //   /api/livez   → external prober (cw-sentinel hits this via api.chainward.ai)
  // /api/health remains as a deeper "is the stack healthy" check for richer
  // monitoring, but it does DB+Redis pings so it can be slow when the DB pool
  // is contended — wrong semantics for binary up/down alerting.
  const livezHandler = (c: import('hono').Context) => c.text('ok');
  app.get('/livez', livezHandler);
  app.get('/api/livez', livezHandler);

  // Global middleware
  app.use(
    '*',
    cors({
      origin: corsOrigins,
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

  // Request-timing log for hot read paths so we can spot backend slowdowns
  // (e.g. /base showing blank for 15s on mobile). Logs only when the route
  // takes >100ms to keep noise down.
  app.use('/api/observatory/*', async (c, next) => {
    const start = Date.now();
    await next();
    const dur = Date.now() - start;
    if (dur > 100) {
      logger.info(
        { path: c.req.path, status: c.res.status, durationMs: dur },
        'observatory slow response',
      );
    }
  });
  app.use('/api/observatory', async (c, next) => {
    const start = Date.now();
    await next();
    const dur = Date.now() - start;
    if (dur > 100) {
      logger.info(
        { path: c.req.path, status: c.res.status, durationMs: dur },
        'observatory slow response',
      );
    }
  });

  // Paid counterparty check (x402). Must run before the /api/risk routes.
  // The payment middleware matches its routes as 'GET …', but Hono also runs GET
  // handlers for HEAD, so a HEAD request ran the paid handler for free. Paid paths
  // answer GET only.
  const paidGetOnly: MiddlewareHandler = async (c, next) => {
    if (c.req.method !== 'GET') {
      c.header('Allow', 'GET');
      return c.json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } }, 405);
    }
    await next();
  };
  // Each path is mounted once, with the route's own input check ahead of the
  // payment middleware, so bad input gets a 400 rather than a 402 to sign.
  // ('/x402/*' also matched the bare '/x402', so a paid GET /api/risk/x402?address=
  // ran the payment middleware twice: the inner run settled, the outer one tried
  // to settle the same payment again.)
  if (x402Check) {
    const paidPaths: Array<[string, MiddlewareHandler]> = [
      ['/api/risk/x402', checkPaidInput((c) => parseCounterpartyInput(c.req.query('address'), c.req.query('chain')))],
      ['/api/risk/x402/:address', checkPaidInput((c) => parseCounterpartyInput(c.req.param('address'), c.req.query('chain')))],
      ['/api/risk/seller-demand', checkPaidInput((c) => parseSellerInput(c.req.query('address'), c.req.query('chain')))],
      ['/api/risk/hires', checkPaidInput((c) => parseHireInput(c.req.query('agent'), c.req.query('chain')))],
      ['/api/paid/:slug/file', checkPaidInput((c) => requireKnownSlug(c.req.param('slug')))],
    ];
    for (const [path, checkInput] of paidPaths) {
      app.use(path, paidGetOnly);
      app.use(path, checkInput);
      app.use(path, x402PublicUrl);
      app.use(path, x402Check);
    }
  }

  app.get('/', (c) => {
    c.header('Cache-Control', 'public, max-age=300');
    return c.html(apiHomePage());
  });
  app.get('/.well-known/x402', (c) => c.json(x402DiscoveryDocument()));
  app.get('/openapi.json', (c) => c.json(x402OpenApiDocument()));

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
  app.route('/api/public/decodes', publicDecodes);
  app.route('/api/risk', risk);
  app.route('/api/observatory', observatory);
  app.route('/api/digest', digest);
  app.route('/api/payments', payments);
  app.route('/api/brief', brief);
  app.route('/api/telemetry', telemetry);
  app.route('/api/x402', x402Board);
  app.route('/api/set-and-earn', setAndEarnBoard);
  app.route('/api/paid', paid);

  // 404 handler
  app.notFound((c) =>
    c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
  );

  return app;
}
