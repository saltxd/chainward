'use client';

/**
 * Sign-In With Ethereum. Kept out of auth-client.ts on purpose: siwe imports the
 * whole ethers library, and auth-client is read by the public masthead on every
 * page. Only the pages that sign in (/login, /request-brief) import this file.
 */
import { SiweMessage } from 'siwe';
import { setSignedInUser, type User } from './auth-client';

/** Sign-in is to ChainWard on Base: the API checks smart-account signatures on Base and refuses other chains. */
const SIGN_IN_CHAIN_ID = 8453;

export async function siweSignIn(
  address: string,
  _connectedChainId: number,
  signMessageAsync: (args: { message: string }) => Promise<string>,
): Promise<{ user: User }> {
  // 1. Fetch nonce
  const nonceRes = await fetch('/api/auth/nonce', { credentials: 'include' });
  const { nonce } = await nonceRes.json();

  // 2. Construct SIWE message
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: 'Sign in to ChainWard',
    uri: window.location.origin,
    version: '1',
    chainId: SIGN_IN_CHAIN_ID,
    nonce,
  });
  const messageStr = message.prepareMessage();

  // 3. Sign
  const signature = await signMessageAsync({ message: messageStr });

  // 4. Verify with API
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message: messageStr, signature }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Verification failed');
  }

  const data = await res.json();
  setSignedInUser(data.user);
  return data;
}
