import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllDecodes } from '@/lib/decodes';

export const metadata: Metadata = {
  title: 'On-Chain Decodes — AI Agent Investigations',
  description:
    'Deep dives into AI agent on-chain activity. We check the chain so you don\'t have to.',
  alternates: { canonical: 'https://chainward.ai/decodes' },
  openGraph: {
    title: 'On-Chain Decodes | ChainWard',
    description:
      'Deep dives into AI agent on-chain activity on Base.',
    url: 'https://chainward.ai/decodes',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'On-Chain Decodes | ChainWard',
    description: 'Deep dives into AI agent on-chain activity on Base.',
    images: ['/chainward-og.png'],
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function DecodesPage() {
  const decodes = getAllDecodes();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar — matches docs layout */}
      <nav className="border-b border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-6 w-6" />
            ChainWard
          </Link>
          <span className="text-text-muted">/</span>
          <span className="text-sm text-muted-foreground">Decodes</span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h1 className="text-2xl font-bold text-white">On-Chain Decodes</h1>
        <p className="mt-2 text-muted-foreground">
          We trace wallets, verify claims, and document what the on-chain data actually shows.
        </p>

        <div className="mt-10 space-y-4">
          {decodes.map((decode) => (
            <Link
              key={decode.slug}
              href={`/decodes/${decode.slug}`}
              className="group block border border-border bg-card p-6 transition-colors hover:border-border-hover"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-white group-hover:text-accent-foreground transition-colors">
                    {decode.title}
                  </h2>
                  {decode.subtitle && (
                    <p className="mt-1 text-sm text-muted-foreground">{decode.subtitle}</p>
                  )}
                </div>
                <time className="shrink-0 text-xs text-text-muted" dateTime={decode.date}>
                  {formatDate(decode.date)}
                </time>
              </div>
            </Link>
          ))}

          {decodes.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">No decodes published yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
