import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';

const health = new Hono();

health.get('/', async (c) => {
  let dbOk = false;
  let redisOk = false;

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch { /* unhealthy */ }

  try {
    const redis = getRedis();
    await redis.ping();
    redisOk = true;
  } catch { /* unhealthy */ }

  const allHealthy = dbOk && redisOk;

  return c.json(
    { status: allHealthy ? 'healthy' : 'degraded' },
    allHealthy ? 200 : 503,
  );
});

export { health };
