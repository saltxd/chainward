import { ReactNode } from 'react';

interface SectionHeadProps {
  tag: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'start' | 'center';
}

export function SectionHead({ tag, title, lede, align = 'start' }: SectionHeadProps) {
  return (
    <div
      className="v2-sh-head"
      style={align === 'center' ? { justifyContent: 'center', textAlign: 'center' } : undefined}
    >
      <div style={{ flex: align === 'center' ? undefined : '0 1 auto' }}>
        <div className="v2-sh-tag">{tag}</div>
        <h2 className="v2-sh-title display">{title}</h2>
      </div>
      {lede && <p className="v2-sh-lede">{lede}</p>}
      <style jsx>{`
        .v2-sh-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 40px;
          margin-bottom: 40px;
          flex-wrap: wrap;
        }
        .v2-sh-tag {
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-sh-tag::before {
          content: '[ ';
          color: var(--fg-dim);
        }
        .v2-sh-tag::after {
          content: ' ]';
          color: var(--fg-dim);
        }
        .v2-sh-title {
          margin-top: 16px;
          font-size: clamp(28px, 4vw, 48px);
          line-height: 1.02;
          max-width: 720px;
        }
        .v2-sh-lede {
          max-width: 400px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.7;
        }
      `}</style>
    </div>
  );
}
