import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The observatory's system user owns every seeded agent and must never act as a signed-in
// account. Sign-in now refuses its address (the zero address), but a session token or API key
// minted for it before that fix would still pass a signature-free check, so both auth
// middlewares refuse its id outright, before any database read.
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

const state = vi.hoisted(() => ({ sub: '', keyOwner: '', dbReads: 0 }));

vi.mock('../lib/auth.js', () => ({
  extractSessionToken: () => 'session-token',
  verifyJwt: async () => ({ sub: state.sub }),
}));
vi.mock('../services/apiKeyService.js', () => ({
  ApiKeyService: class {
    async validate() {
      return { userId: state.keyOwner, scopes: ['read', 'write', 'admin'] };
    }
  },
}));
vi.mock('../lib/db.js', () => ({
  getDb: () => ({
    select: () => {
      state.dbReads += 1;
      const q = { from: () => q, where: () => q, limit: async () => [{ id: state.sub || state.keyOwner, walletAddress: '0x1', displayName: null, tier: 'free' }] };
      return q;
    },
  }),
}));

const { requireAuth } = await import('../middleware/auth.js');
const { requireApiKeyOrSession } = await import('../middleware/apiKeyAuth.js');
const { handleError } = await import('../middleware/errorHandler.js');

function app() {
  const a = new Hono();
  a.onError(handleError);
  a.get('/session', requireAuth, (c) => c.text('ok'));
  a.get('/either', requireApiKeyOrSession(), (c) => c.text('ok'));
  return a;
}

beforeEach(() => {
  state.sub = '';
  state.keyOwner = '';
  state.dbReads = 0;
});

describe('the system user cannot authenticate', () => {
  it('refuses a session token for the system user in requireAuth', async () => {
    state.sub = SYSTEM_USER_ID;
    const res = await app().request('/session');
    expect(res.status).toBe(401);
    expect(state.dbReads).toBe(0);
  });

  it('refuses a session token for the system user in requireApiKeyOrSession', async () => {
    state.sub = SYSTEM_USER_ID;
    const res = await app().request('/either');
    expect(res.status).toBe(401);
    expect(state.dbReads).toBe(0);
  });

  it('refuses an API key owned by the system user', async () => {
    state.keyOwner = SYSTEM_USER_ID;
    const res = await app().request('/either', { headers: { Authorization: 'Bearer ag_test_key' } });
    expect(res.status).toBe(401);
    expect(state.dbReads).toBe(0);
  });

  it('still lets an ordinary user through both middlewares', async () => {
    state.sub = '11111111-1111-1111-1111-111111111111';
    expect((await app().request('/session')).status).toBe(200);
    expect((await app().request('/either')).status).toBe(200);
  });
});
