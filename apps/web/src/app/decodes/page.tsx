import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
} from '@/components/v2';
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

function formatIsoDate(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

export default function DecodesPage() {
  const decodes = getAllDecodes();

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell" style={{ paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        <section style={{ paddingTop: 56 }}>
          <SectionHead
            tag="decodes"
            title={
              <>
                On-chain{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  investigations.
                </span>
              </>
            }
            lede="We trace wallets, verify claims, and document what the on-chain data actually shows. No marketing copy, no cope — just receipts."
          />

          {decodes.length === 0 ? (
            <div className="v2-decodes-empty">No decodes published yet.</div>
          ) : (
            <div className="v2-decodes-grid">
              {decodes.map((decode) => (
                <Link
                  key={decode.slug}
                  href={`/decodes/${decode.slug}`}
                  className="v2-decode-card"
                >
                  <time
                    className="v2-decode-card-date"
                    dateTime={decode.date}
                  >
                    // {formatIsoDate(decode.date)}
                  </time>
                  <h2 className="v2-decode-card-title display">
                    {decode.title}
                  </h2>
                  {decode.subtitle && (
                    <p className="v2-decode-card-sub serif">
                      {decode.subtitle}
                    </p>
                  )}
                  <span className="v2-decode-card-cta">read →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .v2-decodes-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        @media (max-width: 720px) {
          .v2-decodes-grid { grid-template-columns: 1fr; }
        }
        .v2-decode-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 28px;
          border: 1px solid var(--line);
          background: var(--bg-1);
          text-decoration: none;
          transition: border-color 0.15s, background 0.15s, transform 0.15s;
          min-height: 220px;
        }
        .v2-decode-card:hover {
          border-color: var(--phosphor-dim);
          background: var(--bg-2);
        }
        .v2-decode-card-date {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--phosphor);
        }
        .v2-decode-card-title {
          font-size: 26px;
          line-height: 1.08;
          color: var(--fg);
          margin: 0;
          letter-spacing: -0.025em;
        }
        .v2-decode-card-sub {
          font-size: 17px;
          line-height: 1.35;
          color: var(--fg-dim);
          margin: 0;
        }
        .v2-decode-card-cta {
          margin-top: auto;
          padding-top: 16px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--phosphor);
          letter-spacing: 0.04em;
        }
        .v2-decode-card:hover .v2-decode-card-cta {
          color: var(--fg);
        }
        .v2-decodes-empty {
          padding: 48px 0;
          text-align: center;
          color: var(--muted);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
        }
      `}</style>
    </PageShell>
  );
}
