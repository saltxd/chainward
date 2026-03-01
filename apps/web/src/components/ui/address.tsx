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
      <span
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(explorerUrl, '_blank', 'noopener,noreferrer');
        }}
        role="link"
        className="cursor-pointer font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {truncated}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleCopy();
        }}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        title="Copy address"
      >
        {copied ? '✓' : '⎘'}
      </button>
    </span>
  );
}
