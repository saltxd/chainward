import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { ObservatoryService } from '../services/observatoryService.js';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import type { AppVariables } from '../types.js';

let _service: ObservatoryService | null = null;
function getService(): ObservatoryService {
  if (!_service) _service = new ObservatoryService(getDb(), getRedis());
  return _service;
}

const observatory = new Hono<{ Variables: AppVariables }>();

// Public endpoints — 60 req/min per IP, no auth required
observatory.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:observatory' }));

observatory.get('/', async (c) => {
  const data = await getService().getOverview();
  return c.json({ success: true, data });
});

observatory.get('/feed', async (c) => {
  const data = await getService().getFeed();
  return c.json({ success: true, data });
});

observatory.get('/leaderboard', async (c) => {
  const data = await getService().getLeaderboard();
  return c.json({ success: true, data });
});

observatory.get('/trends', async (c) => {
  const data = await getService().getTrends();
  return c.json({ success: true, data });
});

observatory.get('/alerts', async (c) => {
  const data = await getService().getAlertActivity();
  return c.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Candidates — auth required, for reviewing ERC-8004 scout results
// ═══════════════════════════════════════════════════════════════════════════════

observatory.get('/candidates', requireApiKeyOrSession(), async (c) => {
  const db = getDb();
  const status = c.req.query('status') ?? 'pending';

  const rows = await db.execute(sql`
    SELECT id, chain, wallet_address, agent_name, registry_token_id,
           registry_owner, token_uri, tx_count, balance_eth, status, notes, discovered_at
    FROM observatory_candidates
    WHERE status = ${status}
    ORDER BY tx_count DESC
    LIMIT 100
  `);

  return c.json({ success: true, data: rows });
});

observatory.patch('/candidates/:id', requireApiKeyOrSession(), async (c) => {
  const db = getDb();
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{ status: 'approved' | 'dismissed'; notes?: string }>();

  if (!['approved', 'dismissed'].includes(body.status)) {
    return c.json({ success: false, error: 'status must be approved or dismissed' }, 400);
  }

  await db.execute(sql`
    UPDATE observatory_candidates
    SET status = ${body.status},
        notes = COALESCE(${body.notes ?? null}, notes),
        reviewed_at = NOW()
    WHERE id = ${id}
  `);

  return c.json({ success: true });
});

export { observatory };
