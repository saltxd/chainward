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
      ? 'clamp(24px, 6vw, 52px)'
      : size === 'md'
        ? 'clamp(20px, 3.5vw, 34px)'
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
    </div>
  );
}
