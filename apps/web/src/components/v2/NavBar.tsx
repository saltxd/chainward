'use client';

import Link from 'next/link';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

interface NavBarProps {
  links?: NavLink[];
  /**
   * The right-aligned CTA. Optional — when ctaHref/ctaLabel are omitted, no CTA
   * renders (used on the home page so the hero is the only green-filled action).
   * Text portion of the CTA, e.g. "./connect" or "dashboard". The trailing arrow
   * is rendered separately and hidden at ≤480px via the `v2-nav-cta-arrow` class.
   */
  ctaHref?: string;
  ctaLabel?: string;
  brandHref?: string;
  /**
   * When true, suppress the auto-appended `→` after `ctaLabel`.
   * Use for back-link CTAs like `← digest` where the label already
   * carries its own glyph.
   */
  hideArrow?: boolean;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: '/', label: 'check' },
  { href: '/reports', label: 'reports' },
  { href: '/decodes', label: 'decodes' },
  { href: '/base', label: 'observatory' },
];

export function NavBar({
  links = DEFAULT_LINKS,
  ctaHref,
  ctaLabel,
  brandHref = '/',
  hideArrow,
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
        {ctaHref && ctaLabel && (
          <Link href={ctaHref} className="v2-nav-cta">
            <span>{ctaLabel}</span>
            {!hideArrow && (
              <span className="v2-nav-cta-arrow" aria-hidden> →</span>
            )}
          </Link>
        )}
      </div>
    </nav>
  );
}
