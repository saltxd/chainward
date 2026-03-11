'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ObservatoryOverview {
  agentsTracked: number;
  transactions24h: number;
  activeAgents24h: number;
  gasBurned24h: { eth: number; usd: number };
}

export function ObservatoryStats() {
  const [data, setData] = useState<ObservatoryOverview | null>(null);

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) setData(json.data);
      })
      .catch(() => {});
  }, []);

  // Don't render until data loads — avoids layout shift / empty state
  if (!data || data.agentsTracked === 0) return null;

  const stats = [
    { label: 'Agents Tracked', value: String(data.agentsTracked) },
    { label: '24h Transactions', value: String(data.transactions24h) },
    { label: 'Active Now', value: String(data.activeAgents24h) },
    {
      label: '24h Gas Burned',
      value:
        data.gasBurned24h.eth >= 1
          ? `${data.gasBurned24h.eth.toFixed(2)} ETH`
          : `${data.gasBurned24h.eth.toFixed(4)} ETH`,
    },
  ];

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 md:pt-40">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
          Live Agent Intelligence
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
          Right now on Base
        </h2>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#1a1a2e] bg-[#0a0a0f] p-5 text-center"
          >
            <p className="text-2xl font-bold text-[#4ade80]">{s.value}</p>
            <p className="mt-1 text-xs text-[#71717a]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/base"
          className="inline-flex items-center gap-1.5 text-sm text-[#4ade80] transition-colors hover:text-[#22c55e]"
        >
          View full Observatory &rarr;
        </Link>
      </div>
    </section>
  );
}
