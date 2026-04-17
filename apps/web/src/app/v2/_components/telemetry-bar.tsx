'use client';

import { useEffect, useState } from 'react';

interface Observatory {
  agentsTracked: number;
  transactions24h: number;
  transactions7d: number;
  transactions30d: number;
  activeAgents7d: number;
  totalPortfolioValue: number;
  gasBurned7d: { eth: number; usd: number };
  gasBurned30d: { eth: number; usd: number };
}

/**
 * Full-bleed four-column telemetry block. Sits between hero and
 * first section. Uses actual observatory data, rendered with the
 * aesthetic of a trading floor headline — giant mono numerals.
 */
export function TelemetryBar() {
  const [data, setData] = useState<Observatory | null>(null);

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setData(j.data))
      .catch(() => {});
  }, []);

  const tiles = [
    {
      label: 'agents.tracked',
      value: data ? data.agentsTracked.toLocaleString() : '…',
      unit: 'wallets',
    },
    {
      label: 'tx.indexed.7d',
      value: data ? data.transactions7d.toLocaleString() : '…',
      unit: 'transactions',
    },
    {
      label: 'portfolio.under.watch',
      value: data
        ? data.totalPortfolioValue >= 1_000_000
          ? `$${(data.totalPortfolioValue / 1_000_000).toFixed(2)}M`
          : `$${(data.totalPortfolioValue / 1000).toFixed(0)}k`
        : '…',
      unit: 'usd',
    },
    {
      label: 'gas.burned.30d',
      value: data ? `${data.gasBurned30d.eth.toFixed(4)}` : '…',
      unit: `eth · $${data ? data.gasBurned30d.usd.toFixed(0) : '…'}`,
    },
  ];

  return (
    <div
      style={{
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        background:
          'linear-gradient(180deg, var(--bg-1) 0%, var(--bg) 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left-edge kicker */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 32,
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'left center',
          fontSize: 10,
          letterSpacing: '0.3em',
          color: 'var(--phosphor-dim)',
          whiteSpace: 'nowrap',
        }}
      >
        LIVE · BASE MAINNET
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '56px 32px 56px 88px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 40,
        }}
        className="v2-telemetry-grid"
      >
        {tiles.map((t, i) => (
          <div
            key={i}
            style={{
              borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
              paddingLeft: i === 0 ? 0 : 24,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--muted)',
                marginBottom: 12,
                textTransform: 'lowercase',
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontSize: 'clamp(32px, 4vw, 52px)',
                fontWeight: 500,
                color: 'var(--fg)',
                lineHeight: 1,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t.value}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: 'var(--fg-dim)',
                letterSpacing: '0.06em',
              }}
            >
              {t.unit}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .v2-telemetry-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </div>
  );
}
