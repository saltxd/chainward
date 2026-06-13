import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  Badge,
  RISK_NAV_LINKS,
} from '@/components/v2';
import {
  BAND_LABEL,
  reportPath,
  SEVERITY_TONE,
  isThinReport,
} from '@/lib/risk';
import type { RiskLibraryResult, RiskReportCard } from '@/lib/api';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';
const PAGE_SIZE = 60;

// Render per-request so the library reflects newly-published reports and can
// reach the in-cluster API.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Risk Report Library — On-Chain Flags for Base Addresses',
  description:
    'A public, free library of on-chain risk reports for Base addresses. Flags from on-chain behavior, with evidence — never a safety verdict.',
  alternates: { canonical: 'https://chainward.ai/reports' },
  openGraph: {
    title: 'Risk Report Library | ChainWard',
    description:
      'Public on-chain risk reports for Base addresses. Flags, not promises.',
    url: 'https://chainward.ai/reports',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'Risk Report Library | ChainWard',
    description: 'Public on-chain risk reports for Base addresses.',
    images: ['/chainward-og.png'],
  },
};

async function fetchLibrary(): Promise<RiskLibraryResult | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/risk/library?sort=recent&limit=${PAGE_SIZE}&offset=0`,
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success: boolean;
      data?: RiskLibraryResult;
    };
    return json.success ? (json.data ?? null) : null;
  } catch {
    return null;
  }
}

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function CardTile({ card }: { card: RiskReportCard }) {
  const thin = isThinReport(card.flag_count, card.band);
  return (
    <Link
      href={reportPath(card.address)}
      className="v2-lib-card"
      // Thin entries (empty/quiet wallets, zero flags) are deindexed at the
      // page level; nofollow the link so crawlers don't follow into them.
      rel={thin ? 'nofollow' : undefined}
    >
      <div className="v2-lib-card-top">
        <span className="v2-lib-card-addr">
          {card.agent_name ?? truncate(card.address)}
        </span>
        <Badge tone="neutral">{BAND_LABEL[card.band]}</Badge>
      </div>
      {card.agent_name && (
        <span className="v2-lib-card-sub">{truncate(card.address)}</span>
      )}
      <div className="v2-lib-card-flags">
        {card.top_severity ? (
          <Badge tone={SEVERITY_TONE[card.top_severity]}>
            {card.flag_count} flag{card.flag_count === 1 ? '' : 's'} · top {card.top_severity}
          </Badge>
        ) : (
          <span className="v2-lib-card-noflag">0 flags raised</span>
        )}
      </div>
      <div className="v2-lib-card-meta">
        <time dateTime={card.as_of_date}>// {formatDate(card.as_of_date)}</time>
        <span>
          {card.view_count} {card.view_count === 1 ? 'view' : 'views'}
        </span>
      </div>
    </Link>
  );
}

export default async function ReportsLibraryPage() {
  const library = await fetchLibrary();
  const reports = library?.reports ?? [];
  const total = library?.pagination.total ?? reports.length;

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingBottom: 80 }}>
        <NavBar links={RISK_NAV_LINKS} ctaHref="/" ctaLabel="./check" />

        <section style={{ paddingTop: 56 }}>
          <SectionHead
            tag="library"
            title={
              <>
                Every address we&apos;ve checked.{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  Public, free, forever.
                </span>
              </>
            }
            lede="The first time an address is checked, its report is cached and becomes a public, shareable record. Flags from on-chain behavior, with evidence — never a safety verdict."
          />

          {reports.length === 0 ? (
            <div className="v2-lib-empty">
              No reports yet. Be the first —{' '}
              <Link href="/" className="v2-lib-empty-link">
                run a check →
              </Link>
            </div>
          ) : (
            <>
              <div className="v2-lib-count">
                // {total} report{total === 1 ? '' : 's'} indexed
              </div>
              <div className="v2-lib-grid">
                {reports.map((card) => (
                  <CardTile key={card.address} card={card} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <style>{`
        .v2-lib-count {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.06em;
          margin-bottom: 20px;
        }
        .v2-lib-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 880px) {
          .v2-lib-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .v2-lib-grid { grid-template-columns: 1fr; }
        }
        .v2-lib-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 22px;
          border: 1px solid var(--line);
          background: var(--bg-1);
          text-decoration: none;
          transition: border-color 0.15s, background 0.15s;
          min-height: 150px;
        }
        .v2-lib-card:hover {
          border-color: var(--phosphor-dim);
          background: var(--bg-2);
        }
        .v2-lib-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .v2-lib-card-addr {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 14px;
          color: var(--fg);
          letter-spacing: -0.01em;
          word-break: break-all;
        }
        .v2-lib-card-sub {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.02em;
        }
        .v2-lib-card-flags {
          margin-top: auto;
        }
        .v2-lib-card-noflag {
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.04em;
        }
        .v2-lib-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid var(--line);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-lib-empty {
          padding: 48px 0;
          color: var(--fg-dim);
          font-size: 14px;
        }
        .v2-lib-empty-link {
          color: var(--phosphor);
          text-decoration: none;
        }
        .v2-lib-empty-link:hover { color: var(--fg); }
      `}</style>
    </PageShell>
  );
}
