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
    </div>
  );
}
