'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface DigestData {
  week_start: string;
  week_end: string;
  generated_at: string;
  social_snippets: string[] | null;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const SNIPPET_IMAGE_MAP = [
  { label: 'Headline', section: 'headline' },
  { label: 'Leaderboard', section: 'leaderboard' },
  { label: 'Spotlight', section: 'spotlight' },
  { label: 'Anomalies', section: 'anomalies' },
  { label: 'Quick Stats', section: 'stats' },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekEnd + 'T00:00:00Z');
  // weekEnd is exclusive Monday — show Sunday as last day
  end.setUTCDate(end.getUTCDate() - 1);

  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', timeZone: 'UTC' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

/* -------------------------------------------------------------------------- */
/*  Snippet Row Component                                                     */
/* -------------------------------------------------------------------------- */

function SnippetRow({
  snippet,
  index,
  weekStart,
  generatedAt,
}: {
  snippet: string;
  index: number;
  weekStart: string;
  generatedAt: string;
}) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const imageEntry = SNIPPET_IMAGE_MAP[index];
  const section = imageEntry?.section ?? null;
  const label = imageEntry?.label ?? `Snippet ${index + 1}`;

  const charCount = snippet.length;
  const overLimit = charCount > 280;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silently fail
    }
  }, [snippet]);

  const handleDownload = useCallback(async () => {
    if (!section) return;
    try {
      const res = await fetch(`/api/digest/latest/image/${section}?v=${generatedAt}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chainward-digest-${section}-${weekStart}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    }
  }, [section, weekStart]);

  return (
    <div className="rounded-xl border border-white/5 bg-muted p-5">
      {/* Row label + copy button */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="rounded px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Two-column layout: tweet text + image */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Tweet text card */}
        <div className="flex-1 rounded-lg border border-white/[0.06] bg-background p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{snippet}</p>
          <p
            className={`mt-3 text-right text-xs font-mono ${
              overLimit ? 'text-red-400' : 'text-gray-600'
            }`}
          >
            {charCount}/280
          </p>
        </div>

        {/* Image panel */}
        {section ? (
          <div className="flex w-full flex-col items-center rounded-lg border border-white/[0.06] bg-background p-4 sm:w-[360px]">
            {imgError ? (
              <div className="flex h-[202px] w-full items-center justify-center rounded text-xs text-gray-600">
                Image not available
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/digest/latest/image/${section}?v=${generatedAt}`}
                alt={`${label} digest image`}
                className="w-full rounded object-cover"
                style={{ aspectRatio: '16 / 9' }}
                onError={() => setImgError(true)}
              />
            )}
            <button
              onClick={handleDownload}
              className="mt-3 w-full rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-white"
            >
              Download PNG
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Client Component                                                     */
/* -------------------------------------------------------------------------- */

export function SnippetsClient() {
  const router = useRouter();
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth check — redirect to /login if no session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session');
        const json = await res.json();
        if (!json.user) {
          router.replace('/login');
          return;
        }
      } catch {
        router.replace('/login');
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, [router]);

  // Fetch digest data once auth is confirmed
  useEffect(() => {
    if (!authChecked) return;
    async function load() {
      try {
        const res = await fetch('/api/digest/latest');
        if (!res.ok) return;
        const json = await res.json();
        setDigest(json.data ?? null);
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authChecked]);

  const snippets = digest?.social_snippets ?? [];

  /* -- Loading / auth pending state -- */
  if (!authChecked || (loading && authChecked)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(74,222,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between border-b border-white/5 px-6 py-4 md:px-12">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chainward-logo.svg" alt="ChainWard" className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-white">Chain<span className="text-accent-foreground">Ward</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/base/digest"
            className="text-sm text-gray-400 transition-colors hover:text-white"
          >
            ← Digest
          </Link>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Internal Content Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
            Social Snippets
          </h1>
          {digest && (
            <p className="mt-1 text-sm text-gray-400">
              Week of {formatWeekRange(digest.week_start, digest.week_end)}
            </p>
          )}
        </header>

        {/* Snippets */}
        {!loading && snippets.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-muted px-6 py-16 text-center">
            <p className="text-sm text-gray-500">
              No snippets available for the current digest.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {snippets.map((snippet, i) => (
              <SnippetRow
                key={i}
                snippet={snippet}
                index={i}
                weekStart={digest?.week_start ?? ''}
                generatedAt={digest?.generated_at ?? ''}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
