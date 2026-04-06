import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAllDecodes, getDecodeBySlug } from '@/lib/decodes';

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
  const ogImageUrl = `https://chainward.ai/api/decodes/${slug}/og`;

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function DecodePage({ params }: PageProps) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) notFound();

  const { meta, content } = decode;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <nav className="border-b border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-6 w-6" />
            ChainWard
          </Link>
          <span className="text-text-muted">/</span>
          <Link href="/decodes" className="text-sm text-muted-foreground hover:text-white transition-colors">
            Decodes
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* Article header */}
        <header className="mb-10 border-b border-border pb-8">
          <time className="text-xs text-text-muted" dateTime={meta.date}>
            {formatDate(meta.date)}
          </time>
          <h1 className="mt-2 text-3xl font-bold text-white">{meta.title}</h1>
          {meta.subtitle && (
            <p className="mt-2 text-lg text-muted-foreground">{meta.subtitle}</p>
          )}
        </header>

        {/* Markdown content */}
        <article className="decode-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>

        {/* Back link */}
        <div className="mt-16 border-t border-border pt-8">
          <Link
            href="/decodes"
            className="text-sm text-muted-foreground hover:text-accent-foreground transition-colors"
          >
            &larr; All Decodes
          </Link>
        </div>
      </main>
    </div>
  );
}
