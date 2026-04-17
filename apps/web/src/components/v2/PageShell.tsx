import { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  showOverlay?: boolean;
}

export function PageShell({ children, showOverlay = true }: PageShellProps) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {showOverlay && (
        <>
          <div className="v2-scanline" aria-hidden />
          <div className="v2-grain" aria-hidden />
        </>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
