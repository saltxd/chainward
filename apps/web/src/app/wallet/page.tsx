'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicHeader } from '@/components/layout/public-header';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function WalletLookupPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = input.trim();

    if (!ADDRESS_REGEX.test(trimmed)) {
      setError('Enter a valid Ethereum address (0x followed by 40 hex characters)');
      return;
    }

    setError('');
    router.push(`/wallet/${trimmed}`);
  }

  return (
    <div className="min-h-screen">
      <PublicHeader />
    <div className="flex flex-1 flex-col items-center justify-center px-4 pt-24">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold">Wallet Lookup</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste any wallet address to see recent activity on Base
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError('');
            }}
            placeholder="0x..."
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-accent-foreground placeholder:text-muted-foreground/50"
          />

          {error && (
            <p className="mt-2 text-left text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-accent-foreground py-3.5 text-sm font-semibold text-background transition-colors hover:bg-accent-foreground/90"
          >
            Look up
          </button>
        </form>
      </div>

      <div className="mt-16 w-full max-w-lg text-left">
        <h2 className="text-sm font-medium text-muted-foreground">What you&apos;ll see</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-muted">
          <li>Recent transactions — transfers, swaps, contract calls with timestamps and gas costs</li>
          <li>Token balances — ETH and ERC-20 holdings on Base</li>
          <li>Gas spend analysis — total gas burned and average cost per transaction</li>
          <li>Activity patterns — transaction frequency and direction (in/out)</li>
        </ul>
        <p className="mt-6 text-xs text-text-muted">
          No sign-up required. Data sourced from Base mainnet. Use this tool to research any wallet
          before adding it to your ChainWard monitoring fleet.
        </p>
      </div>

      <p className="mt-12 text-center text-xs text-muted-foreground/60">
        Powered by Chain<span className="text-accent-foreground/60">Ward</span> &mdash; AgentOps for Base
      </p>
    </div>
    </div>
  );
}
