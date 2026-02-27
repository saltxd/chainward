'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AddressProps {
  address: string;
  chain?: string;
  className?: string;
}

export function Address({ address, chain = 'base', className }: AddressProps) {
  const [copied, setCopied] = useState(false);

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const explorerUrl =
    chain === 'base'
      ? `https://basescan.org/address/${address}`
      : `https://solscan.io/account/${address}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {truncated}
      </a>
      <button
        onClick={handleCopy}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        title="Copy address"
      >
        {copied ? '✓' : '⎘'}
      </button>
    </span>
  );
}
