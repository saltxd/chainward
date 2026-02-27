import type { Context, Next } from 'hono';
import { getAuth } from '../lib/auth.js';
import { AppError } from './errorHandler.js';

export async function requireAuth(c: Context, next: Next) {
  const betterAuth = getAuth();
  const session = await betterAuth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  // Store user and session in context using type-safe approach
  c.set('user' as never, session.user as never);
  c.set('session' as never, session.session as never);
  await next();
}
