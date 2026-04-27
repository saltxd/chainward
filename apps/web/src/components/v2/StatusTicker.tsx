'use client';

import { useEffect, useState } from 'react';

type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

interface Telemetry {
  sentinelTip: number | null;
  baseTip: number | null;
  baseTipSource: 'base-public' | 'blockscout' | null;
  sentinelLag: number | null;
  sentinelStatus: SignalStatus;
  indexerHeartbeatAt: string | null;
  indexerHeartbeatAgeSeconds: number | null;
  indexerLastTxAt: string | null;
  indexerLagSeconds: number | null;
  indexerStatus: SignalStatus;
  checkedAt: string;
  // legacy aliases for back-compat
  lag?: number | null;
  status?: SignalStatus;
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '?';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function colorForStatus(s: SignalStatus): string {
  if (s === 'online') return 'var(--phosphor)';
  if (s === 'syncing') return 'var(--amber)';
  if (s === 'degraded') return 'var(--amber)';
  return 'var(--danger)';
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

  // Sentinel RPC node status (is our node keeping up with chain tip?)
  // When no reference is available we don't claim degradation — we just say
  // "unverified" since our sentinel is responding, we just can't compare.
  const sentinelLabel = (() => {
    if (!telemetry) return '…';
    const s = telemetry.sentinelStatus;
    if (s === 'offline') return 'OFFLINE';
    if (s === 'online' && telemetry.baseTip === null) return 'ONLINE · no ref';
    if (s === 'online') return 'ONLINE';
    if (s === 'syncing') return `SYNCING · lag ${telemetry.sentinelLag ?? '?'}`;
    if (s === 'degraded') return `DEGRADED · lag ${telemetry.sentinelLag ?? '?'}`;
    return 'OFFLINE';
  })();

  // Indexer status — based on process heartbeat, not tx activity.
  // A quiet day (no txs) ≠ broken indexer. We show last-tx age as info text.
  const indexerLabel = (() => {
    if (!telemetry) return '…';
    const s = telemetry.indexerStatus;
    const txAge = formatAge(telemetry.indexerLagSeconds);
    const hbAge = formatAge(telemetry.indexerHeartbeatAgeSeconds);
    if (s === 'offline') return 'OFFLINE';
    if (s === 'degraded') return `STALLED · hb ${hbAge}`;
    // online — heartbeat is fresh, show last-tx age so readers can see activity
    return telemetry.indexerLastTxAt ? `LIVE · tx ${txAge}` : 'LIVE · no tx yet';
  })();

  const items: Array<{
    label: string;
    value: string;
    live?: boolean;
    color?: string;
    mobileHide?: boolean;
  }> = [
    {
      label: 'base.tip',
      value: telemetry?.baseTip ? `#${telemetry.baseTip.toLocaleString()}` : '…',
      live: true,
    },
    {
      label: 'sentinel.tip',
      value: telemetry?.sentinelTip ? `#${telemetry.sentinelTip.toLocaleString()}` : '…',
      mobileHide: true,
    },
    {
      label: 'fleet.size',
      value: observatory ? String(observatory.agentsTracked) : '…',
      mobileHide: true,
    },
    {
      label: 'tx.7d',
      value: observatory ? observatory.transactions7d.toLocaleString() : '…',
      mobileHide: true,
    },
    {
      label: 'tvl.watched',
      value: observatory ? formatUsd(observatory.totalPortfolioValue) : '…',
      mobileHide: true,
    },
    { label: 'utc', value: now || '…', mobileHide: true },
    {
      label: 'rpc',
      value: sentinelLabel,
      color: telemetry ? colorForStatus(telemetry.sentinelStatus) : undefined,
    },
    {
      label: 'indexer',
      value: indexerLabel,
      color: telemetry ? colorForStatus(telemetry.indexerStatus) : undefined,
    },
  ];

  return (
    <div className="v2-ticker">
      <div className="v2-ticker-row">
        {items.map((item, i) => (
          <span
            key={i}
            className={`v2-ticker-item${item.mobileHide ? ' v2-ticker-item--mobile-hide' : ''}`}
          >
            <span className="v2-ticker-label">{item.label}</span>
            <span
              className="v2-ticker-value"
              style={{ color: item.color ?? 'var(--fg)' }}
            >
              {item.value}
            </span>
            {item.live && <span className="v2-ticker-pulse" aria-hidden />}
          </span>
        ))}
      </div>
    </div>
  );
}
