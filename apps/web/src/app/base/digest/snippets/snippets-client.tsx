'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  Button,
  Badge,
} from '@/components/v2';

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
  { label: 'headline', section: 'headline' },
  { label: 'leaderboard', section: 'leaderboard' },
  { label: 'spotlight', section: 'spotlight' },
  { label: 'anomalies', section: 'anomalies' },
  { label: 'quick.stats', section: 'stats' },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekEnd + 'T00:00:00Z');
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
  const label = imageEntry?.label ?? `snippet.${index + 1}`;

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
  }, [section, generatedAt, weekStart]);

  return (
    <div className="v2-snip-row">
      {/* Row label + copy button */}
      <div className="v2-snip-row-head">
        <Badge tone="phosphor">{label}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
        >
          {copied ? 'copied ✓' : 'copy'}
        </Button>
      </div>

      {/* Two-column layout: tweet text + image */}
      <div className="v2-snip-row-body">
        {/* Tweet text */}
        <div className="v2-snip-text">
          <p className="v2-snip-text-content">{snippet}</p>
          <p
            className="v2-snip-count"
            style={{ color: overLimit ? 'var(--danger)' : 'var(--muted)' }}
          >
            {charCount}/280
          </p>
        </div>

        {/* Image panel */}
        {section ? (
          <div className="v2-snip-image">
            {imgError ? (
              <div className="v2-snip-image-error">image not available</div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/digest/latest/image/${section}?v=${generatedAt}`}
                alt={`${label} digest image`}
                className="v2-snip-image-img"
                onError={() => setImgError(true)}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              fullWidth
            >
              download png
            </Button>
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
      <PageShell>
        <StatusTicker />
        <div className="v2-shell">
          <NavBar ctaHref="/base/digest" ctaLabel="← digest" />
          <div className="v2-snip-loading">
            <span className="v2-snip-loading-dot" />
            loading…
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell" style={{ paddingBottom: 80 }}>
        <NavBar ctaHref="/base/digest" ctaLabel="← digest" />

        <section style={{ paddingTop: 56 }}>
          <SectionHead
            tag="internal · content"
            title={
              <>
                Social{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  snippets.
                </span>
              </>
            }
            lede={
              digest
                ? `Ready-to-post threads, one per digest section. Week of ${formatWeekRange(digest.week_start, digest.week_end)}.`
                : 'Ready-to-post threads, one per digest section.'
            }
          />

          {!loading && snippets.length === 0 ? (
            <div className="v2-snip-empty">// no snippets available for the current digest</div>
          ) : (
            <div className="v2-snip-list">
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
        </section>
      </div>

      <style>{`
        .v2-snip-loading {
          min-height: 50vh;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--muted);
          font-size: 13px;
          letter-spacing: 0.08em;
        }
        .v2-snip-loading-dot {
          width: 8px;
          height: 8px;
          background: var(--phosphor);
          box-shadow: 0 0 8px var(--phosphor);
          animation: v2-pulse 1.4s ease-in-out infinite;
          display: inline-block;
        }

        .v2-snip-empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--muted);
          border: 1px solid var(--line);
          background: var(--bg-1);
          font-size: 13px;
        }

        .v2-snip-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .v2-snip-row {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-snip-row-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .v2-snip-row-body {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 720px) {
          .v2-snip-row-body {
            grid-template-columns: 1fr;
          }
        }

        .v2-snip-text {
          border: 1px solid var(--line);
          background: var(--bg);
          padding: 18px;
        }
        .v2-snip-text-content {
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.7;
          color: var(--fg);
          margin: 0;
        }
        .v2-snip-count {
          margin-top: 14px;
          text-align: right;
          font-size: 11px;
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
        }

        .v2-snip-image {
          display: flex;
          flex-direction: column;
          gap: 12px;
          border: 1px solid var(--line);
          background: var(--bg);
          padding: 14px;
        }
        .v2-snip-image-img {
          width: 100%;
          aspect-ratio: 16 / 9;
          object-fit: cover;
          border: 1px solid var(--line);
          display: block;
        }
        .v2-snip-image-error {
          aspect-ratio: 16 / 9;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          font-size: 11px;
          border: 1px dashed var(--line);
          letter-spacing: 0.04em;
        }
      `}</style>
    </PageShell>
  );
}
