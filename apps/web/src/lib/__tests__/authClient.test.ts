import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiweMessage } from 'siwe';
import { siweSignIn } from '../auth-client';

// The API verifies smart-account signatures on Base and refuses other chains,
// so the message must say Base even when the wallet is connected elsewhere.

describe('siweSignIn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the SIWE message for Base (8453) whatever chain the wallet is on', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/nonce')) return new Response(JSON.stringify({ nonce: 'a1b2c3d4e5f6' }));
      return new Response(JSON.stringify({ user: { id: 'u1', walletAddress: '0x' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { host: 'chainward.ai', origin: 'https://chainward.ai' } });

    let signed = '';
    await siweSignIn('0x4baADbA26C3C0bdEf9E8fAf173925d463aA53BB2', 1, async ({ message }) => {
      signed = message;
      return '0xsig';
    });

    expect(new SiweMessage(signed).chainId).toBe(8453);
  });
});
