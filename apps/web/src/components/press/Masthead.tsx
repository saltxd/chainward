import Link from 'next/link';

export interface MastLink {
  href: string;
  label: string;
  external?: boolean;
  /** Hide on narrow phones (nav collapses to nameplate + a couple links). */
  hideOnMobile?: boolean;
}

const DEFAULT_LINKS: MastLink[] = [
  { href: '/', label: 'Check' },
  { href: '/reports', label: 'Reports', hideOnMobile: true },
  { href: '/decodes', label: 'Decodes' },
  { href: '/base', label: 'Observatory', hideOnMobile: true },
  { href: '/request-brief', label: 'Brief' },
];

interface MastheadProps {
  links?: MastLink[];
  brandHref?: string;
}

/**
 * The publication nameplate + running nav. A broadsheet masthead: the
 * ChainWard wordmark set in the display face, a thin oxblood-accented rule, and
 * a monospace nav rail. Consistent chrome across every public page.
 */
export function Masthead({ links = DEFAULT_LINKS, brandHref = '/' }: MastheadProps) {
  return (
    <header className="ph-mast">
      <div className="ph-mast-row">
        <Link href={brandHref} className="ph-name" aria-label="ChainWard — home">
          ChainWard<span className="ph-name-tld">.ai</span>
        </Link>
        <nav className="ph-nav" aria-label="Primary">
          {links.map((l) =>
            l.external ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={l.hideOnMobile ? 'ph-nav-hide' : undefined}
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className={l.hideOnMobile ? 'ph-nav-hide' : undefined}
              >
                {l.label}
              </Link>
            ),
          )}
          {/* Quiet account entry — the route the retired ./connect button served. */}
          <Link href="/login" className="ph-nav-signin">
            Connect Wallet
          </Link>
        </nav>
      </div>
    </header>
  );
}
