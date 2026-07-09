import { ReactNode } from 'react';

interface PressShellProps {
  children: ReactNode;
}

/**
 * Paper-ground wrapper for every public "dossier" page. The `.press` class is
 * the scope root: all paper tokens + editorial styles in styles/press.css live
 * under it, so the dark v2 dashboard is never affected. No scanline/grain
 * overlays here — this surface is ink on paper, not a terminal.
 */
export function PressShell({ children }: PressShellProps) {
  return <div className="press">{children}</div>;
}
