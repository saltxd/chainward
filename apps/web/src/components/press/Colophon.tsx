import Link from 'next/link';
import { NodeClaim, NodeSyncNote } from './NodeClaim';

/**
 * The colophon — a publication's closing plate. Double rule, the honest
 * one-liner, and a monospace index of sections. Shared footer for public pages.
 */
export function Colophon() {
  return (
    <footer className="ph-colophon">
      <div className="ph-colophon-row">
        <p className="ph-colophon-note">
          ChainWard reads Base <NodeClaim live="from its own node" neutral="directly" /> and
          files what the chain shows — flags, never a safety verdict. Free &amp; public.
          <NodeSyncNote />
        </p>
        <nav className="ph-colophon-links" aria-label="Footer">
          <Link href="/reports">Reports</Link>
          <Link href="/decodes">Decodes</Link>
          <Link href="/request-brief">Brief</Link>
          <Link href="/base">Observatory</Link>
          <Link href="/mcp">MCP</Link>
          <Link href="/docs">Docs</Link>
          <a href="https://x.com/chainwardai" target="_blank" rel="noopener noreferrer">
            X
          </a>
        </nav>
      </div>
    </footer>
  );
}
