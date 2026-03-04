import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@chainward/db';
import { verifyJwt, COOKIE_NAME } from '../lib/auth.js';
import { getDb } from '../lib/db.js';
import { AppError } from './errorHandler.js';

export async function requireAuth(c: Context, next: Next) {
  const cookie = c.req.header('Cookie');
  const token = cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session');
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not found');
  }

  c.set('user' as never, {
    id: user.id,
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    tier: user.tier,
  } as never);

  await next();
}
