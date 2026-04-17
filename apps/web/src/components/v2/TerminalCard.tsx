import { ReactNode } from 'react';

interface TerminalCardProps {
  title?: string;
  status?: string;
  children: ReactNode;
  bodyStyle?: React.CSSProperties;
}

export function TerminalCard({
  title = '~/chainward',
  status = 'session.live',
  children,
  bodyStyle,
}: TerminalCardProps) {
  return (
    <div className="v2-term">
      <div className="v2-term-bar">
        <span className="v2-term-dots">
          <span />
          <span />
          <span />
        </span>
        <span>{title}</span>
        <span className="v2-term-status">● {status}</span>
      </div>
      <div className="v2-term-body" style={bodyStyle}>
        {children}
      </div>
      <style jsx>{`
        .v2-term {
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.7;
          box-shadow: 0 0 80px rgba(61, 216, 141, 0.04) inset;
        }
        .v2-term-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .v2-term-dots {
          display: inline-flex;
          gap: 4px;
        }
        .v2-term-dots :global(span) {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #3a3f38;
        }
        .v2-term-status {
          margin-left: auto;
          color: var(--phosphor);
        }
        .v2-term-body {
          padding: 16px 18px;
        }
      `}</style>
    </div>
  );
}
