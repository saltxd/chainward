import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@chainward/db';
import { verifyJwt, extractSessionToken } from '../lib/auth.js';
import { getDb } from '../lib/db.js';
import { SYSTEM_USER_ID } from '../lib/systemUser.js';
import { AppError } from './errorHandler.js';

export async function requireAuth(c: Context, next: Next) {
  const token = extractSessionToken(c);

  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const payload = await verifyJwt(token);
  // The observatory's system user never signs in; refuse any token minted for it.
  if (!payload || payload.sub === SYSTEM_USER_ID) {
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
