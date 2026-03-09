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
            className="w-full rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-[#4ade80] placeholder:text-muted-foreground/50"
          />

          {error && (
            <p className="mt-2 text-left text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-[#4ade80] py-3.5 text-sm font-semibold text-black transition-colors hover:bg-[#22c55e]"
          >
            Look up
          </button>
        </form>
      </div>

      <p className="mt-12 text-center text-xs text-muted-foreground/60">
        Powered by Chain<span className="text-[#4ade80]/60">Ward</span> &mdash; Datadog for on-chain agents
      </p>
    </div>
    </div>
  );
}
