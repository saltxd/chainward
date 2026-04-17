'use client';

import Link from 'next/link';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

interface NavBarProps {
  links?: NavLink[];
  ctaHref: string;
  ctaLabel: string;
  brandHref?: string;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: '/base', label: 'observatory' },
  { href: '/decodes', label: 'decodes' },
  { href: '/wallet', label: 'lookup' },
];

export function NavBar({
  links = DEFAULT_LINKS,
  ctaHref,
  ctaLabel,
  brandHref = '/',
}: NavBarProps) {
  return (
    <nav className="v2-nav">
      <Link href={brandHref} className="v2-nav-brand">
        <span className="v2-nav-dot" aria-hidden />
        <span>
          chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span>
        </span>
      </Link>
      <div className="v2-nav-links">
        {links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-nav-link"
            >
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className="v2-nav-link">
              {l.label}
            </Link>
          ),
        )}
        <Link href={ctaHref} className="v2-nav-cta">
          {ctaLabel}
        </Link>
      </div>
      <style jsx>{`
        .v2-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 0;
          border-bottom: 1px solid var(--line);
          font-size: 12px;
        }
        .v2-nav-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--fg);
          text-decoration: none;
        }
        .v2-nav-dot {
          display: block;
          width: 10px;
          height: 10px;
          background: var(--phosphor);
          box-shadow: 0 0 8px var(--phosphor);
          animation: v2-pulse 2s ease-in-out infinite;
        }
        .v2-nav-links {
          display: flex;
          gap: 24px;
          align-items: center;
          color: var(--fg-dim);
        }
        .v2-nav-links :global(.v2-nav-link) {
          color: var(--fg-dim);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-nav-links :global(.v2-nav-link:hover) {
          color: var(--phosphor);
        }
        .v2-nav-cta {
          padding: 8px 18px;
          background: var(--phosphor);
          color: var(--bg) !important;
          font-weight: 600;
          font-size: 12px;
          letter-spacing: 0.02em;
          transition: box-shadow 0.15s;
        }
        .v2-nav-cta:hover {
          box-shadow: 0 0 24px rgba(61, 216, 141, 0.4);
        }
        @media (max-width: 720px) {
          .v2-nav-links {
            gap: 14px;
          }
        }
      `}</style>
    </nav>
  );
}
