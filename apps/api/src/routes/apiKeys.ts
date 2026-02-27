import { Hono } from 'hono';
import { z } from 'zod';
import type { AppVariables } from '../types.js';
import { ApiKeyService } from '../services/apiKeyService.js';
import { getDb } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const apiKeysRoute = new Hono<{ Variables: AppVariables }>();
apiKeysRoute.use('*', requireAuth);

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

// Create a new API key (returns the raw key once)
apiKeysRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const input = createKeySchema.parse(body);

  const service = new ApiKeyService(getDb());
  const key = await service.create(user.id, input);

  return c.json({ success: true, data: key }, 201);
});

// List all API keys (without raw keys)
apiKeysRoute.get('/', async (c) => {
  const user = c.get('user');
  const service = new ApiKeyService(getDb());
  const keys = await service.list(user.id);

  return c.json({ success: true, data: keys });
});

// Revoke an API key
apiKeysRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'API key ID must be a number');

  const service = new ApiKeyService(getDb());
  await service.revoke(user.id, id);

  return c.json({ success: true, data: null });
});

export { apiKeysRoute };
