import type { Metadata } from 'next';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
import { getAllDecodes } from '@/lib/decodes';

export const metadata: Metadata = {
  title: 'On-Chain Decodes — AI Agent Investigations',
  description:
    'Deep dives into AI agent on-chain activity. We check the chain so you don\'t have to.',
  alternates: { canonical: 'https://chainward.ai/decodes' },
  openGraph: {
    title: 'On-Chain Decodes | ChainWard',
    description: 'Deep dives into AI agent on-chain activity on Base.',
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
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="dx-lead">
          <span className="press-label">The Casebook</span>
          <h1 className="dx-title press-display">
            On-chain investigations.
          </h1>
          <p className="dx-lede">
            We trace wallets, verify claims, and document what the chain actually
            shows — no marketing copy, no cope, just receipts. Each decode is filed
            and dated below.
          </p>
        </section>

        {decodes.length === 0 ? (
          <div className="dx-empty">No decodes filed yet.</div>
        ) : (
          <ol className="dx-list">
            {decodes.map((decode, i) => (
              <li key={decode.slug} className="dx-filing">
                <Link href={`/decodes/${decode.slug}`} className="dx-filing-link">
                  <div className="dx-filing-meta">
                    <span className="dx-filing-no mono">
                      № {String(decodes.length - i).padStart(3, '0')}
                    </span>
                    <time className="dx-filing-date mono" dateTime={decode.date}>
                      {formatIsoDate(decode.date)}
                    </time>
                  </div>
                  <div className="dx-filing-body">
                    <h2 className="dx-filing-title press-display">{decode.title}</h2>
                    {decode.subtitle && (
                      <p className="dx-filing-sub">{decode.subtitle}</p>
                    )}
                    <span className="dx-filing-read">Read the file →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <Colophon />
      </div>

      <style>{`
        .dx-lead {
          padding: 44px 0 40px;
          max-width: 760px;
        }
        .dx-title {
          margin: 14px 0 0;
          font-size: clamp(38px, 6vw, 68px);
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .dx-lede {
          margin: 22px 0 0;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        .dx-list {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 3px double var(--rule-strong);
        }
        .dx-filing {
          border-bottom: 1px solid var(--rule);
        }
        .dx-filing-link {
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 32px;
          padding: 30px 0;
          text-decoration: none;
          color: inherit;
        }
        .dx-filing-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 6px;
        }
        .dx-filing-no {
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--oxblood);
        }
        .dx-filing-date {
          font-size: 12px;
          color: var(--ink-faint);
          letter-spacing: 0.04em;
        }
        .dx-filing-title {
          margin: 0;
          font-size: clamp(26px, 3.6vw, 40px);
          line-height: 1.03;
          transition: color 0.15s;
        }
        .dx-filing-link:hover .dx-filing-title { color: var(--oxblood); }
        .dx-filing-sub {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.4;
          color: var(--ink-soft);
          max-width: 640px;
        }
        .dx-filing-read {
          display: inline-block;
          margin-top: 16px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--oxblood);
        }
        .dx-empty {
          padding: 48px 0;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
          color: var(--ink-faint);
        }
        @media (max-width: 640px) {
          .dx-filing-link { grid-template-columns: 1fr; gap: 12px; }
          .dx-filing-meta { flex-direction: row; gap: 16px; padding-top: 0; }
        }
      `}</style>
    </PressShell>
  );
}
