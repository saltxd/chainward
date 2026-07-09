import { existsSync } from 'fs';
import { join } from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
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

function formatEditorialDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">
              Decode <span className="ph-dateline-sep">·</span>{' '}
              <span className="mono">{formatIsoDate(meta.date)}</span>
            </div>
            <h1 className="da-title press-display">{meta.title}</h1>
            {meta.subtitle && <p className="da-sub">{meta.subtitle}</p>}
            <div className="da-byline">
              <span>By ChainWard</span>
              <span className="ph-dateline-sep">·</span>
              <span>Filed {formatEditorialDate(meta.date)}</span>
              <span className="ph-dateline-sep">·</span>
              <span>Verified against on-chain data</span>
            </div>
          </header>

          <div className="da-body press-measure">
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

          <footer className="da-footer press-measure">
            <Link href="/decodes" className="press-link">
              ← All decodes
            </Link>
            <Link href="/request-brief" className="press-link">
              Commission a brief →
            </Link>
          </footer>
        </article>

        <Colophon />
      </div>

      <style>{`
        .da { padding-top: 44px; }
        .da-header {
          padding-bottom: 28px;
          border-bottom: 3px double var(--rule-strong);
          margin-bottom: 40px;
        }
        .da-title {
          margin: 16px 0 0;
          font-size: clamp(34px, 6vw, 62px);
          line-height: 1.0;
          letter-spacing: -0.03em;
        }
        .da-sub {
          margin: 18px 0 0;
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: clamp(20px, 3vw, 27px);
          line-height: 1.3;
          color: var(--ink-soft);
          font-variation-settings: "opsz" 48, "SOFT" 40;
        }
        .da-byline {
          margin-top: 22px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .da-footer {
          margin-top: 52px;
          padding-top: 22px;
          border-top: 1px solid var(--rule);
          display: flex;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
      `}</style>
    </PressShell>
  );
}
