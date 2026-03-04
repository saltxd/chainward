'use client';

import { useState, useEffect, useCallback } from 'react';
import { SiweMessage } from 'siwe';

interface User {
  id: string;
  walletAddress: string;
  displayName: string | null;
  tier: string;
}

interface SessionData {
  user: User | null;
}

const listeners = new Set<() => void>();
let cachedSession: SessionData | null = null;

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export async function fetchSession(): Promise<SessionData> {
  const res = await fetch('/api/auth/session', { credentials: 'include' });
  const data = await res.json();
  cachedSession = data;
  notifyListeners();
  return data;
}

export async function siweSignIn(
  address: string,
  chainId: number,
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
    chainId,
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
  cachedSession = { user: data.user };
  notifyListeners();
  return data;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  cachedSession = { user: null };
  notifyListeners();
}

export function useSession(): {
  data: { user: User } | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(cachedSession);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSession();
      setSession(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Listen for session changes from other components
    const listener = () => setSession(cachedSession);
    listeners.add(listener);

    // Fetch session on mount if not cached
    if (!cachedSession) {
      refetch();
    } else {
      setLoading(false);
    }

    return () => { listeners.delete(listener); };
  }, [refetch]);

  return {
    data: session?.user ? { user: session.user } : null,
    loading,
    refetch,
  };
}
