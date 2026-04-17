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
    </nav>
  );
}
