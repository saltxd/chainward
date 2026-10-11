import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The digest's social snippets sit behind sign-in at /latest/snippets; the public
// /latest (and /:weekStart) answered them to anyone. Signed-out callers now get the
// digest without them; a signed-in session (the snippets dashboard) still has them.
const store = vi.hoisted(() => new Map<string, string>());
const redis = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => (store.set(key, value), 'OK')),
  pipeline: vi.fn(() => {
    const p = {
      zremrangebyscore: () => p,
      zcard: () => p,
      zadd: () => p,
      expire: () => p,
      exec: async () => [
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ],
    };
    return p;
  }),
}));
const row = {
  week_start: '2026-10-05',
  week_end: '2026-10-11',
  headline: 'A week on Base',
  social_snippets: ['draft post one', 'draft post two'],
};
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/db.js', () => ({ getDb: () => ({ execute: async () => [row] }) }));

import { digest } from '../routes/digest.js';
import { handleError } from '../middleware/errorHandler.js';
import { COOKIE_NAME, signJwt } from '../lib/auth.js';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/digest', digest);
  return a;
}

async function data(path: string, headers: Record<string, string> = {}) {
  const res = await app().request(path, { headers });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe('public digest routes', () => {
  beforeEach(() => store.clear());

  it.each(['/api/digest/latest', '/api/digest/2026-10-05'])('GET %s leaves out social_snippets when signed out', async (path) => {
    const d = await data(path);
    expect(d.headline).toBe('A week on Base');
    expect(d).not.toHaveProperty('social_snippets');
  });

  it('leaves them out when served from the cache too', async () => {
    await data('/api/digest/latest');
    expect(store.has('digest:latest')).toBe(true);
    expect(await data('/api/digest/latest')).not.toHaveProperty('social_snippets');
  });

  it('leaves them out for a forged session cookie', async () => {
    const d = await data('/api/digest/latest', { cookie: `${COOKIE_NAME}=not-a-jwt` });
    expect(d).not.toHaveProperty('social_snippets');
  });

  it('keeps them for a signed-in session', async () => {
    const token = await signJwt('user-1', '0x1111111111111111111111111111111111111111');
    const d = await data('/api/digest/latest', { cookie: `${COOKIE_NAME}=${token}` });
    expect(d.social_snippets).toEqual(row.social_snippets);
  });
});
