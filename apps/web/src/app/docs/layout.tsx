'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

const navItems = [
  { href: '/docs', label: 'Overview' },
  { href: '/docs/cli', label: 'CLI' },
  { href: '/docs/api', label: 'API' },
  { href: '/docs/alerts', label: 'Alerts' },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <div className="docs">
          <aside className="docs-sidebar" aria-label="Documentation navigation">
            <div className="press-label">Documentation</div>
            <ul className="docs-nav">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`docs-nav-link${active ? ' docs-nav-link-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="docs-sidebar-foot">
              <Link href="/" className="docs-sidebar-link">
                ← Home
              </Link>
              <Link href="/base" className="docs-sidebar-link">
                ← Observatory
              </Link>
            </div>
          </aside>

          <main className="docs-main">{children}</main>
        </div>

        <Colophon />
      </div>

      <style>{`
        .docs {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 56px;
          padding-top: 40px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .docs {
            grid-template-columns: 1fr;
            gap: 24px;
            padding-top: 24px;
          }
        }
        .docs-sidebar {
          position: sticky;
          top: 24px;
          border-right: 1px solid var(--rule);
          padding-right: 24px;
          min-height: 240px;
        }
        @media (max-width: 900px) {
          .docs-sidebar {
            position: static;
            border-right: none;
            border-bottom: 1px solid var(--rule);
            padding-right: 0;
            padding-bottom: 20px;
            min-height: 0;
          }
        }
        .docs-nav {
          list-style: none;
          padding: 0;
          margin: 16px 0 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        @media (max-width: 900px) {
          .docs-nav {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 16px;
          }
        }
        .docs-nav-link {
          display: inline-block;
          padding: 6px 0;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: color 0.15s;
        }
        .docs-nav-link:hover {
          color: var(--oxblood);
        }
        .docs-nav-link-active {
          color: var(--oxblood);
          border-bottom-color: var(--oxblood);
        }
        .docs-sidebar-foot {
          margin-top: 32px;
          padding-top: 18px;
          border-top: 1px solid var(--rule);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        @media (max-width: 900px) {
          .docs-sidebar-foot {
            display: none;
          }
        }
        .docs-sidebar-link {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--ink-faint);
          text-decoration: none;
          transition: color 0.15s;
        }
        .docs-sidebar-link:hover {
          color: var(--oxblood);
        }
        .docs-main {
          min-width: 0;
          max-width: 760px;
        }
      `}</style>
    </PressShell>
  );
}
