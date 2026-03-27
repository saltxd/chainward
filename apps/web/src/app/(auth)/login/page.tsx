'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  async function handleSignIn() {
    if (!address || !chainId) return;
    setError('');
    setSigning(true);

    try {
      await siweSignIn(address, chainId, signMessageAsync);
      router.push('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Pre-connect card */}
      {!isConnected && (
        <div className="w-full rounded-2xl border border-border bg-card/80 p-8 backdrop-blur">
          {/* Wallet icon */}
          <div className="mb-5 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/50">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
          </div>

          <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
            ChainWard uses wallet-based authentication.
            Connect a self-custodial wallet to monitor
            your onchain agents — no email or password needed.
          </p>

          <button
            onClick={openConnectModal}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
          >
            Connect
          </button>
        </div>
      )}

      {/* Post-connect: sign in */}
      {isConnected && (
        <div className="w-full rounded-2xl border border-border bg-card/80 p-8 backdrop-blur">
          <div className="mb-5 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent-foreground/30 bg-accent-foreground/10">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="text-accent-foreground"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          </div>

          <p className="mb-1 text-center text-sm font-medium">
            Wallet connected
          </p>
          <p className="mb-6 text-center font-mono text-xs text-muted-foreground">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signing}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(74,222,128,0.15)] disabled:opacity-50"
          >
            {signing ? 'Signing...' : 'Sign in with Ethereum'}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground/60">
        Chain<span className="text-accent-foreground/60">Ward</span>
      </p>
    </div>
  );
}
