import { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'phosphor' | 'danger' | 'amber';
}

export function StatTile({ label, value, unit, size = 'lg', tone = 'default' }: StatTileProps) {
  const fontSize =
    size === 'lg'
      ? 'clamp(32px, 4vw, 52px)'
      : size === 'md'
        ? 'clamp(22px, 2.6vw, 34px)'
        : '20px';

  const valueColor =
    tone === 'phosphor'
      ? 'var(--phosphor)'
      : tone === 'danger'
        ? 'var(--danger)'
        : tone === 'amber'
          ? 'var(--amber)'
          : 'var(--fg)';

  return (
    <div className="v2-tile">
      <div className="v2-tile-label">{label}</div>
      <div className="v2-tile-value" style={{ fontSize, color: valueColor }}>
        {value}
      </div>
      {unit && <div className="v2-tile-unit">{unit}</div>}
      <style jsx>{`
        .v2-tile {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .v2-tile-label {
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--muted);
          margin-bottom: 12px;
          text-transform: lowercase;
        }
        .v2-tile-value {
          font-weight: 500;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
        }
        .v2-tile-unit {
          margin-top: 10px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.06em;
        }
      `}</style>
    </div>
  );
}
