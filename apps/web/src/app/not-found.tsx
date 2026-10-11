import type { Metadata } from 'next';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

// Next adds its own <meta name="robots" content="noindex"> to every 404. Null
// drops the root layout's "index, follow", so the page carries that one tag only.
export const metadata: Metadata = {
  title: 'Page not found',
  robots: null,
};

export default function NotFound() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="press-notice">
          <div className="press-fileno">File № 404</div>
          <h1 className="press-notice-title press-display">This page isn&apos;t on file.</h1>
          <p className="press-notice-lede">
            The link may be old, or the address in it mistyped. If you were about to pay or hire an AI
            agent, paste its wallet address into the free check. Or read how we look into agents in the
            decodes.
          </p>
          <div className="press-notice-ctas">
            <Link href="/" className="press-btn">
              Check an address →
            </Link>
            <Link href="/decodes" className="press-btn press-btn--ghost">
              Read the decodes
            </Link>
          </div>
        </section>

        <Colophon />
      </div>
    </PressShell>
  );
}
