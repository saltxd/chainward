import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@chainward/db';
import { ApiKeyService } from '../services/apiKeyService.js';
import { getDb } from '../lib/db.js';
import { AppError } from './errorHandler.js';
import { verifyJwt, COOKIE_NAME } from '../lib/auth.js';

function inferRequiredScope(method: string): string {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'read' : 'write';
}

/**
 * Middleware that authenticates via API key (Bearer token) OR session.
 * API key takes priority if both are present.
 * Sets user context variables on success.
 */
export function requireApiKeyOrSession(requiredScope?: string) {
  return async (c: Context, next: Next) => {
    const scopeToEnforce = requiredScope ?? inferRequiredScope(c.req.method);
    const authHeader = c.req.header('Authorization');

    if (authHeader?.startsWith('Bearer ag_')) {
      // API key authentication
      const rawKey = authHeader.slice('Bearer '.length);
      const db = getDb();
      const service = new ApiKeyService(db);
      const result = await service.validate(rawKey);

      if (!result) {
        throw new AppError(401, 'INVALID_API_KEY', 'Invalid or expired API key');
      }

      // Check scope if required
      if (!result.scopes.includes(scopeToEnforce) && !result.scopes.includes('admin')) {
        throw new AppError(403, 'INSUFFICIENT_SCOPE', `API key lacks required scope: ${scopeToEnforce}`);
      }

      // Load user details
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, result.userId))
        .limit(1);

      if (!user) {
        throw new AppError(401, 'USER_NOT_FOUND', 'API key owner not found');
      }

      c.set('user' as never, {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        tier: user.tier,
      } as never);

      await next();
      return;
    }

    // Fall back to JWT session auth
    const cookie = c.req.header('Cookie');
    const token = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE_NAME}=`))
      ?.split('=')
      .slice(1)
      .join('=');

    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required. Provide a Bearer API key or session cookie.');
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
  };
}
