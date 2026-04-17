'use client';

import { useEffect, useState } from 'react';

interface Telemetry {
  sentinelTip: number | null;
  baseTip: number | null;
  lag: number | null;
  status: 'online' | 'syncing' | 'degraded' | 'offline';
  checkedAt: string;
}

/**
 * Top-of-page status strip. All values are real:
 * - sentinel/base tips come from /api/telemetry (sentinel via viem, base via Blockscout)
 * - fleet.size / tx.7d / tvl from /api/observatory
 * - utc from client clock
 *
 * No fake "ONLINE" indicators — if the sentinel is behind chain tip it says SYNCING.
 */
export function StatusTicker() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [observatory, setObservatory] = useState<{
    agentsTracked: number;
    transactions7d: number;
    totalPortfolioValue: number;
  } | null>(null);
  const [now, setNow] = useState('');

  useEffect(() => {
    const loadObservatory = () =>
      fetch('/api/observatory')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.data && setObservatory(j.data))
        .catch(() => {});

    const loadTelemetry = () =>
      fetch('/api/telemetry')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.data && setTelemetry(j.data))
        .catch(() => {});

    loadObservatory();
    loadTelemetry();

    const obsTimer = setInterval(loadObservatory, 60_000);
    const telTimer = setInterval(loadTelemetry, 12_000);
    const clockTimer = setInterval(
      () => setNow(new Date().toISOString().slice(11, 19)),
      1000,
    );
    return () => {
      clearInterval(obsTimer);
      clearInterval(telTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const formatUsd = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(1)}k`;

  const statusColor =
    telemetry?.status === 'online'
      ? 'var(--phosphor)'
      : telemetry?.status === 'syncing'
        ? 'var(--amber)'
        : telemetry?.status === 'degraded'
          ? 'var(--amber)'
          : 'var(--danger)';

  const sentinelLabel =
    telemetry === null
      ? '…'
      : telemetry.status === 'online'
        ? 'ONLINE'
        : telemetry.status === 'syncing'
          ? `SYNCING · lag ${telemetry.lag}`
          : telemetry.status === 'degraded'
            ? `DEGRADED · lag ${telemetry.lag ?? '?'}`
            : 'OFFLINE';

  const items = [
    {
      label: 'base.tip',
      value: telemetry?.baseTip ? `#${telemetry.baseTip.toLocaleString()}` : '…',
      live: true,
    },
    {
      label: 'sentinel.tip',
      value: telemetry?.sentinelTip ? `#${telemetry.sentinelTip.toLocaleString()}` : '…',
    },
    { label: 'fleet.size', value: observatory ? String(observatory.agentsTracked) : '…' },
    { label: 'tx.7d', value: observatory ? observatory.transactions7d.toLocaleString() : '…' },
    {
      label: 'tvl.watched',
      value: observatory ? formatUsd(observatory.totalPortfolioValue) : '…',
    },
    { label: 'utc', value: now || '…' },
    { label: 'sentinel', value: sentinelLabel, color: statusColor },
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
          gap: 22,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {items.map((item, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>{item.label}</span>
            <span
              style={{
                color: item.color ?? 'var(--fg)',
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
