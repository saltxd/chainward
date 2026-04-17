'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageShell, NavBar, StatusTicker } from '@/components/v2';

const navItems = [
  { href: '/docs', label: 'overview' },
  { href: '/docs/cli', label: 'cli' },
  { href: '/docs/api', label: 'api' },
  { href: '/docs/alerts', label: 'alerts' },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Simple client-side cookie check (the root layout already handled the heavy lifting)
    setIsAuthenticated(
      typeof document !== 'undefined' &&
        document.cookie.split(';').some((c) => c.trim().startsWith('chainward-session=')),
    );
  }, []);

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell">
        <NavBar
          ctaHref={isAuthenticated ? '/overview' : '/login'}
          ctaLabel={isAuthenticated ? 'dashboard →' : './connect →'}
        />
      </div>

      <div className="v2-shell v2-docs">
        <aside className="v2-docs-sidebar" aria-label="Documentation navigation">
          <div className="v2-docs-sidebar-tag">[ docs ]</div>
          <ul className="v2-docs-nav">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`v2-docs-nav-link${active ? ' v2-docs-nav-link-active' : ''}`}
                  >
                    <span className="v2-docs-nav-prompt">{active ? '>' : ' '}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="v2-docs-sidebar-foot">
            <Link href="/" className="v2-docs-sidebar-link">
              ../home
            </Link>
            <Link href="/base" className="v2-docs-sidebar-link">
              ../observatory
            </Link>
          </div>
        </aside>

        <main className="v2-docs-main">{children}</main>
      </div>

      <style>{`
        .v2-docs {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 48px;
          padding-top: 40px;
          padding-bottom: 80px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .v2-docs {
            grid-template-columns: 1fr;
            gap: 24px;
            padding-top: 24px;
          }
        }
        .v2-docs-sidebar {
          position: sticky;
          top: 24px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          text-transform: lowercase;
          letter-spacing: 0.04em;
          border-right: 1px solid var(--line);
          padding-right: 24px;
          min-height: 240px;
        }
        @media (max-width: 900px) {
          .v2-docs-sidebar {
            position: static;
            border-right: none;
            border-bottom: 1px solid var(--line);
            padding-right: 0;
            padding-bottom: 20px;
            min-height: 0;
          }
        }
        .v2-docs-sidebar-tag {
          font-size: 10px;
          letter-spacing: 0.14em;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 18px;
        }
        .v2-docs-nav {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        @media (max-width: 900px) {
          .v2-docs-nav {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 12px;
          }
        }
        .v2-docs-nav-link {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          color: var(--fg-dim);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-docs-nav-link:hover {
          color: var(--phosphor);
        }
        .v2-docs-nav-link-active {
          color: var(--phosphor);
        }
        .v2-docs-nav-prompt {
          width: 10px;
          color: var(--phosphor);
          font-weight: 700;
        }
        .v2-docs-sidebar-foot {
          margin-top: 32px;
          padding-top: 18px;
          border-top: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        @media (max-width: 900px) {
          .v2-docs-sidebar-foot {
            display: none;
          }
        }
        .v2-docs-sidebar-link {
          color: var(--muted);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-docs-sidebar-link:hover {
          color: var(--fg);
        }
        .v2-docs-main {
          min-width: 0;
          max-width: 780px;
        }
      `}</style>
    </PageShell>
  );
}
