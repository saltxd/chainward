import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@agentguard/db';
import { ApiKeyService } from '../services/apiKeyService.js';
import { getDb } from '../lib/db.js';
import { AppError } from './errorHandler.js';

/**
 * Middleware that authenticates via API key (Bearer token) OR session.
 * API key takes priority if both are present.
 * Sets user context variables on success.
 */
export function requireApiKeyOrSession(requiredScope?: string) {
  return async (c: Context, next: Next) => {
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
      if (requiredScope && !result.scopes.includes(requiredScope) && !result.scopes.includes('admin')) {
        throw new AppError(403, 'INSUFFICIENT_SCOPE', `API key lacks required scope: ${requiredScope}`);
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
        email: user.email,
        name: user.name,
        tier: (user as Record<string, unknown>).tier ?? 'free',
      } as never);
      c.set('session' as never, {
        id: 'api-key',
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000),
      } as never);

      await next();
      return;
    }

    // Fall back to session auth
    const { getAuth } = await import('../lib/auth.js');
    const betterAuth = getAuth();
    const session = await betterAuth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required. Provide a Bearer API key or session cookie.');
    }

    c.set('user' as never, session.user as never);
    c.set('session' as never, session.session as never);
    await next();
  };
}
