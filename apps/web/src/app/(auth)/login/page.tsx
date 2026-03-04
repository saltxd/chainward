'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
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
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          Chain<span className="text-primary">Ward</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect your wallet to sign in</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <ConnectButton />

        {isConnected && (
          <button
            onClick={handleSignIn}
            disabled={signing}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {signing ? 'Signing...' : 'Sign in with Ethereum'}
          </button>
        )}
      </div>
    </div>
  );
}
