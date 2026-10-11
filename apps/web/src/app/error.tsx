'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The raw message can carry internals, so it goes to the console, never the page.
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="press-notice">
          <div className="press-fileno">Something went wrong</div>
          <h1 className="press-notice-title press-display">This page didn&apos;t load.</h1>
          <p className="press-notice-lede">
            Something broke on our side while putting it together. Try again in a moment. If it keeps
            happening, the free check and the decodes are still a click away.
          </p>
          {error.digest && <p className="press-notice-ref">Reference {error.digest}</p>}
          <div className="press-notice-ctas">
            <button type="button" onClick={reset} className="press-btn">
              Try again
            </button>
            <Link href="/" className="press-btn press-btn--ghost">
              Check an address
            </Link>
            <Link href="/decodes" className="press-link">
              Read the decodes
            </Link>
          </div>
        </section>

        <Colophon />
      </div>
    </PressShell>
  );
}
