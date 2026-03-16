import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import type { AppVariables } from '../types.js';

const digest = new Hono<{ Variables: AppVariables }>();

// Public endpoints — 60 req/min per IP, no auth required
digest.use('*', rateLimit({ max: 60, windowSec: 60, prefix: 'rl:digest' }));

// GET /api/digest/latest — most recent weekly digest full payload
digest.get('/latest', async (c) => {
  const redis = getRedis();
  const cached = await redis.get('digest:latest');
  if (cached) return c.json({ success: true, data: JSON.parse(cached) });

  const db = getDb();
  const rows = await db.execute(sql`
    SELECT * FROM weekly_digests ORDER BY week_start DESC LIMIT 1
  `);

  const data = (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;
  if (!data) return c.json({ success: true, data: null });

  await redis.set('digest:latest', JSON.stringify(data), 'EX', 300); // 5 min cache
  return c.json({ success: true, data });
});

// GET /api/digest/latest/snippets — auth required (internal content dashboard)
digest.get('/latest/snippets', requireApiKeyOrSession(), async (c) => {
  const redis = getRedis();
  const cached = await redis.get('digest:latest');

  let data: Record<string, unknown> | null = null;
  if (cached) {
    data = JSON.parse(cached) as Record<string, unknown>;
  } else {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT * FROM weekly_digests ORDER BY week_start DESC LIMIT 1
    `);
    data = (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;
    if (data) {
      await redis.set('digest:latest', JSON.stringify(data), 'EX', 300);
    }
  }

  if (!data) return c.json({ success: true, data: [] });

  const snippets = data.social_snippets ?? [];
  return c.json({ success: true, data: snippets });
});

// GET /api/digest/archive — list of all digests with headline numbers only
digest.get('/archive', async (c) => {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT week_start, week_end, headline, generated_at
    FROM weekly_digests ORDER BY week_start DESC LIMIT 52
  `);
  return c.json({ success: true, data: rows });
});

// GET /api/digest/:weekStart — digest for a specific week (YYYY-MM-DD of Monday)
digest.get('/:weekStart', async (c) => {
  const weekStart = c.req.param('weekStart');

  // Basic YYYY-MM-DD format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return c.json({ success: false, error: 'weekStart must be in YYYY-MM-DD format' }, 400);
  }

  const db = getDb();
  const rows = await db.execute(sql`
    SELECT * FROM weekly_digests WHERE week_start = ${weekStart}
  `);

  const data = (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;
  if (!data) return c.json({ success: false, error: 'Digest not found for this week' }, 404);

  return c.json({ success: true, data });
});

export { digest };
