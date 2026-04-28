import { existsSync } from 'fs';
import { join } from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  PageShell,
  NavBar,
  StatusTicker,
} from '@/components/v2';
import { getAllDecodes, getDecodeBySlug } from '@/lib/decodes';

// Some scrapers (notably X/Twitter) reliably fetch static OG assets but
// silently fail on the @vercel/og dynamic Edge route. If a decode has a
// pre-rendered og.png in public/decodes/<slug>/, prefer it.
function resolveOgImageUrl(slug: string): string {
  const staticOgPath = join(process.cwd(), 'public', 'decodes', slug, 'og.png');
  if (existsSync(staticOgPath)) {
    return `https://chainward.ai/decodes/${slug}/og.png`;
  }
  return `https://chainward.ai/api/decodes/${slug}/og`;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllDecodes().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) return {};

  const { meta } = decode;
  const ogImageUrl = resolveOgImageUrl(slug);

  return {
    title: meta.title,
    description: meta.subtitle,
    alternates: { canonical: `https://chainward.ai/decodes/${slug}` },
    openGraph: {
      title: meta.title,
      description: meta.subtitle,
      url: `https://chainward.ai/decodes/${slug}`,
      type: 'article',
      publishedTime: meta.date,
      images: [{ url: ogImageUrl, width: 1200, height: 675 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.subtitle,
      images: [ogImageUrl],
    },
  };
}

function formatIsoDate(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

export default async function DecodePage({ params }: PageProps) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) notFound();

  const { meta, content } = decode;

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell" style={{ paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        <article style={{ paddingTop: 56 }}>
          <header className="v2-decode-header">
            <div className="v2-decode-meta">
              <time className="v2-decode-date" dateTime={meta.date}>
                // {formatIsoDate(meta.date)}
              </time>
              <span className="v2-decode-tag">on-chain · decode</span>
            </div>
            <h1 className="v2-decode-title display">{meta.title}</h1>
            {meta.subtitle && (
              <p className="v2-decode-sub serif">{meta.subtitle}</p>
            )}
            <div className="v2-decode-byline">
              chainward.ai · human-verified against on-chain data
            </div>
          </header>

          <div className="v2-decode-body">
            <div className="decode-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node: _node, ...props }) => (
                    <div className="decode-table-scroll">
                      <table {...props} />
                    </div>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>

          <footer className="v2-decode-footer">
            <Link href="/decodes" className="v2-decode-back">
              ← all decodes
            </Link>
          </footer>
        </article>
      </div>

      <style>{`
        .v2-decode-header {
          border-bottom: 1px solid var(--line);
          padding-bottom: 32px;
          margin-bottom: 40px;
          max-width: 780px;
        }
        .v2-decode-meta {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .v2-decode-date {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--phosphor);
        }
        .v2-decode-tag {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .v2-decode-title {
          margin-top: 20px;
          font-size: clamp(32px, 5vw, 56px);
          line-height: 1.02;
          letter-spacing: -0.035em;
          color: var(--fg);
        }
        .v2-decode-sub {
          margin-top: 16px;
          font-size: 22px;
          line-height: 1.35;
          color: var(--fg-dim);
          max-width: 680px;
        }
        .v2-decode-byline {
          margin-top: 24px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--muted);
        }
        .v2-decode-body {
          max-width: 780px;
        }
        .v2-decode-footer {
          max-width: 780px;
          margin-top: 56px;
          padding-top: 24px;
          border-top: 1px solid var(--line);
        }
        .v2-decode-back {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--fg-dim);
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.15s;
        }
        .v2-decode-back:hover {
          color: var(--phosphor);
        }
      `}</style>
    </PageShell>
  );
}
