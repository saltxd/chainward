'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/api';

export function OnboardingBanner() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const address = session?.user?.walletAddress;
  if (!address || done) return null;

  async function handleRegister() {
    if (!address) return;
    setLoading(true);
    try {
      const created = await api.createAgent({
        chain: 'base',
        walletAddress: address,
        agentName: 'My Wallet',
      });
      setDone(true);
      const params = new URLSearchParams({
        wallet: created.data.walletAddress,
        preset: 'failed_tx',
        source: 'onboarding-banner',
      });
      router.push(`/alerts?${params.toString()}`);
    } catch {
      // Silently fail — user can register manually
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-accent-foreground/30 bg-accent-foreground/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-accent-foreground">Monitor this wallet and set a first alert?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Start monitoring{' '}
            <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>{' '}
            on Base, then jump straight into a recommended failed-transaction alert.
          </p>
        </div>
        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full shrink-0 rounded-lg bg-accent-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-foreground/90 disabled:opacity-50 sm:w-auto min-h-[44px]"
        >
          {loading ? 'Adding...' : 'Register + Set Alert'}
        </button>
      </div>
    </div>
  );
}
