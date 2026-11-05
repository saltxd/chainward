import { describe, expect, it, vi } from 'vitest';

// Some routes read the session token themselves (the profile route, the digest gate) rather than
// through the auth middleware, so the system user is refused inside verifyJwt: every caller,
// present and future, treats a token minted for it as invalid.
vi.mock('../config.js', () => ({ getEnv: () => ({ JWT_SECRET: 'test-secret-for-verifyJwt-system-user-0123456789' }) }));

const { signJwt, verifyJwt } = await import('../lib/auth.js');

describe('verifyJwt and the observatory system user', () => {
  it('treats a validly signed token for the system user as invalid', async () => {
    const token = await signJwt('00000000-0000-0000-0000-000000000000', '0x0000000000000000000000000000000000000000');
    expect(await verifyJwt(token)).toBeNull();
  });

  it('still accepts an ordinary user token', async () => {
    const token = await signJwt('11111111-1111-1111-1111-111111111111', '0x1111111111111111111111111111111111111111');
    expect(await verifyJwt(token)).toEqual({
      sub: '11111111-1111-1111-1111-111111111111',
      address: '0x1111111111111111111111111111111111111111',
    });
  });
});
