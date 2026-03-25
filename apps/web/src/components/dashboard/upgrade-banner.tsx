'use client';

import { useState } from 'react';
import Link from 'next/link';

interface UpgradeBannerProps {
  agentCount: number;
  agentLimit: number;
}

export function UpgradeBanner({ agentCount, agentLimit }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || agentCount < agentLimit) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#4ade80]/20 bg-[#4ade80]/5 px-4 py-3">
      <p className="text-sm text-[#a1a1aa]">
        <span className="font-medium text-white">Need more agents?</span>{' '}
        Upgrade to Operator — 25 USDC/mo, 10 agents, 90-day history.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/#pricing"
          className="rounded-md bg-[#4ade80] px-3 py-1.5 text-xs font-semibold text-[#050508] transition-colors hover:bg-[#22c55e]"
        >
          Upgrade &rarr;
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md px-2 py-1.5 text-xs text-[#71717a] transition-colors hover:text-white"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
