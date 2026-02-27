import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';

const health = new Hono();

health.get('/', async (c) => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Check database
  try {
    const start = performance.now();
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch {
    checks.database = { status: 'error' };
  }

  // Check Redis
  try {
    const start = performance.now();
    const redis = getRedis();
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch {
    checks.redis = { status: 'error' };
  }

  const allHealthy = Object.values(checks).every((check) => check.status === 'ok');

  return c.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
      checks,
    },
    allHealthy ? 200 : 503,
  );
});

export { health };
