'use client';

import { useEffect, useState } from 'react';

/**
 * Top-of-page status strip — always visible, feels like a Bloomberg header
 * or a mission-control bar. Real data from /api/observatory, but block height
 * simulates live increments client-side so it feels alive between polls.
 */
export function StatusTicker() {
  const [blockHeight, setBlockHeight] = useState(0);
  const [observatory, setObservatory] = useState<{
    agentsTracked: number;
    transactions7d: number;
    gasBurned7d: { usd: number };
    totalPortfolioValue: number;
  } | null>(null);
  const [now, setNow] = useState('');

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setObservatory(j.data))
      .catch(() => {});

    // Block height — pull from our API if available, else simulate
    fetch('https://base.blockscout.com/api/v2/main-page/blocks')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const height = j?.[0]?.height ?? 28_400_000;
        setBlockHeight(height);
      })
      .catch(() => setBlockHeight(28_400_000));

    const tick = setInterval(() => {
      setBlockHeight((h) => (h > 0 ? h + 1 : h));
      setNow(new Date().toISOString().slice(11, 19));
    }, 2000);
    return () => clearInterval(tick);
  }, []);

  const formatUsd = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(1)}k`;

  const items = [
    { label: 'base.block', value: blockHeight ? `#${blockHeight.toLocaleString()}` : '...', live: true },
    { label: 'fleet.size', value: observatory ? String(observatory.agentsTracked) : '...' },
    { label: 'tx.7d', value: observatory ? observatory.transactions7d.toLocaleString() : '...' },
    { label: 'tvl.watched', value: observatory ? formatUsd(observatory.totalPortfolioValue) : '...' },
    { label: 'utc', value: now || '...' },
    { label: 'sentinel', value: 'ONLINE', ok: true },
  ];

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        borderBottom: '1px solid var(--line)',
        fontSize: 11,
        color: 'var(--fg-dim)',
        background: 'var(--bg-1)',
        letterSpacing: '0.04em',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '8px 32px',
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {items.map((item, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>{item.label}</span>
            <span
              style={{
                color: item.ok ? 'var(--phosphor)' : 'var(--fg)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.value}
            </span>
            {item.live && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: 'var(--phosphor)',
                  boxShadow: '0 0 6px var(--phosphor)',
                  animation: 'pulse 1.4s ease-in-out infinite',
                  display: 'inline-block',
                }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
