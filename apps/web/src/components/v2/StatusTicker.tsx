'use client';

import { useEffect, useState } from 'react';

interface Telemetry {
  sentinelTip: number | null;
  baseTip: number | null;
  lag: number | null;
  status: 'online' | 'syncing' | 'degraded' | 'offline';
  checkedAt: string;
}

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

  const items: Array<{ label: string; value: string; live?: boolean; color?: string }> = [
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
    <div className="v2-ticker">
      <div className="v2-ticker-row">
        {items.map((item, i) => (
          <span key={i} className="v2-ticker-item">
            <span className="v2-ticker-label">{item.label}</span>
            <span className="v2-ticker-value" style={{ color: item.color ?? 'var(--fg)' }}>
              {item.value}
            </span>
            {item.live && <span className="v2-ticker-pulse" aria-hidden />}
          </span>
        ))}
      </div>
    </div>
  );
}
