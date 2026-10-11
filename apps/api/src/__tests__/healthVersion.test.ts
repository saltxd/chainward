import { afterEach, describe, expect, it, vi } from 'vitest';

// CI waits for /api/health to report its own build before running the login
// smoke against production, so the API says which commit it was built from.

vi.mock('../lib/db.js', () => ({ getDb: () => ({ execute: async () => [] }) }));
vi.mock('../lib/redis.js', () => ({ getRedis: () => ({ ping: async () => 'PONG' }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function get(): Promise<Record<string, unknown>> {
  const { health } = await import('../routes/health.js');
  const res = await health.request('/');
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe('GET /api/health', () => {
  it('reports the commit the image was built from', async () => {
    vi.stubEnv('GIT_SHA', 'ba3d78c');
    expect(await get()).toEqual({ status: 'healthy', version: 'ba3d78c' });
  });

  it('reports a null version outside a CI-built image', async () => {
    vi.stubEnv('GIT_SHA', '');
    expect(await get()).toEqual({ status: 'healthy', version: null });
  });
});
