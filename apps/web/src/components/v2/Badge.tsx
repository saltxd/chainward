import { ReactNode } from 'react';

type Tone = 'neutral' | 'phosphor' | 'amber' | 'danger' | 'cyan';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`v2-badge v2-badge-${tone}`}>
      {children}
      <style jsx>{`
        .v2-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-family: var(--font-mono), ui-monospace, monospace;
          border: 1px solid var(--line-2);
          line-height: 1.6;
        }
        .v2-badge-neutral {
          color: var(--fg-dim);
        }
        .v2-badge-phosphor {
          color: var(--phosphor);
          border-color: var(--phosphor-dim);
        }
        .v2-badge-amber {
          color: var(--amber);
          border-color: rgba(232, 160, 51, 0.3);
        }
        .v2-badge-danger {
          color: var(--danger);
          border-color: rgba(230, 103, 103, 0.3);
        }
        .v2-badge-cyan {
          color: var(--cyan);
          border-color: rgba(94, 196, 230, 0.3);
        }
      `}</style>
    </span>
  );
}
