'use client';

import { useState, useEffect, useCallback } from 'react';

export interface User {
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

/**
 * Record a fresh sign-in so every useSession() hook on the page updates. Called
 * by siweSignIn (lib/siwe-sign-in.ts), which lives apart from this file so the
 * public pages that only read the session never download siwe (and the ethers
 * library it pulls in).
 */
export function setSignedInUser(user: User): void {
  cachedSession = { user };
  notifyListeners();
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
