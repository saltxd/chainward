'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { Button } from '@/components/v2';

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
    <div
      style={{
        border: '1px solid var(--phosphor-dim)',
        background:
          'linear-gradient(180deg, rgba(58, 167, 109, 0.05), transparent 80%), var(--bg-1)',
        padding: '24px 28px',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.14em',
          color: 'var(--phosphor)',
          marginBottom: 10,
          textTransform: 'uppercase',
        }}
      >
        // first.run
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <h3
            className="display"
            style={{
              fontSize: 20,
              color: 'var(--fg)',
              margin: 0,
              letterSpacing: '-0.025em',
            }}
          >
            Monitor this wallet and arm your first alert?
          </h3>
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              color: 'var(--fg-dim)',
              lineHeight: 1.7,
            }}
          >
            Start monitoring{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg)',
                background: 'rgba(58, 167, 109, 0.08)',
                padding: '1px 6px',
                border: '1px solid var(--line)',
              }}
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>{' '}
            on Base, then jump straight into a recommended failed-transaction alert.
          </p>
        </div>
        <Button onClick={handleRegister} disabled={loading}>
          {loading ? 'registering…' : './register + arm-alert'}
        </Button>
      </div>
    </div>
  );
}
