import type { Metadata } from 'next';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
import { reportPath, isThinReport } from '@/lib/risk';
import type { RiskLibraryResult, RiskReportCard, RiskSeverity } from '@/lib/api';
import { chainMeta } from '@/lib/chains';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';
const PAGE_SIZE = 60;

// Render per-request so the register reflects newly-published reports and can
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
    images: [{ url: '/chainward-og-press.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'Risk Report Library | ChainWard',
    description: 'Public on-chain risk reports for Base addresses.',
    images: ['/chainward-og-press.png'],
  },
};

const SEV_VAR: Record<RiskSeverity, string> = {
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
};

async function fetchLibrary(): Promise<RiskLibraryResult | null> {
  try {
    // distinct=address → one row per address (its latest filing). Re-checks
    // otherwise read as duplicate entries; report_count carries the "filed N×".
    const res = await fetch(
      `${API_URL}/api/risk/library?sort=recent&limit=${PAGE_SIZE}&offset=0&distinct=address`,
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

function RegisterRow({ card }: { card: RiskReportCard }) {
  const thin = isThinReport(card.flag_count, card.band);
  // The headline flag: the highest-severity one the API denormalised onto the card.
  const topFlag =
    card.top_flags?.[0] ??
    (card.top_severity ? { title: `${card.flag_count} flag${card.flag_count === 1 ? '' : 's'}`, severity: card.top_severity } : null);
  return (
    <Link
      href={reportPath(card.address, card.chain)}
      className="reg-row"
      // Thin entries (empty/quiet wallets, zero flags) are deindexed at the
      // page level; nofollow so crawlers don't follow into them.
      rel={thin ? 'nofollow' : undefined}
    >
      <span className="reg-cell reg-subject">
        <span className="reg-cell-label">Address</span>
        <span className="reg-subject-name mono">
          {card.agent_name ?? truncate(card.address)}
          <span className="reg-chain">{chainMeta(card.chain).shortName}</span>
        </span>
        {card.agent_name && (
          <span className="reg-subject-addr mono">{truncate(card.address)}</span>
        )}
      </span>
      <span className="reg-cell reg-flags">
        <span className="reg-cell-label">What we found</span>
        {topFlag ? (
          <span className="reg-found">
            <span className="reg-found-title">
              <span className="reg-sev-dot" style={{ background: SEV_VAR[topFlag.severity] }} aria-hidden="true" />
              {topFlag.title}
            </span>
            <span className="reg-found-meta mono">
              {topFlag.severity}
              {card.flag_count > 1 ? ` · +${card.flag_count - 1} more` : ''}
            </span>
          </span>
        ) : (
          <span className="reg-found reg-found--none">Nothing flagged in the window checked</span>
        )}
      </span>
      <span className="reg-cell reg-filed">
        <span className="reg-cell-label">Last checked</span>
        <span className="reg-filed-val">
          <time className="mono" dateTime={card.as_of_date}>
            {formatDate(card.as_of_date)}
          </time>
          {(card.report_count ?? 1) > 1 && (
            <span className="reg-filed-count mono">re-checked {(card.report_count ?? 1) - 1}×</span>
          )}
        </span>
      </span>
      <span className="reg-cell reg-views mono">
        <span className="reg-cell-label">Views</span>
        {card.view_count}
      </span>
    </Link>
  );
}

export default async function ReportsLibraryPage() {
  const library = await fetchLibrary();
  const reports = library?.reports ?? [];
  const total = library?.pagination.total ?? reports.length;

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="reg-lead">
          <span className="press-label">The Public Record</span>
          <h1 className="reg-title press-display">Every address we&apos;ve checked.</h1>
          <p className="reg-lede">
            The first time an address is checked, its report is filed here as a
            public, shareable record — free, forever. Flags from on-chain behavior,
            with evidence. Never a safety verdict.
          </p>
          <p className="reg-legend mono">
            A flag is one observation with the transactions behind it, ranked info → low → medium → high.
            &ldquo;Nothing flagged&rdquo; means nothing in the window checked, not a clearance.
          </p>
        </section>

        {reports.length === 0 ? (
          <div className="reg-empty">
            No reports filed yet. Be the first —{' '}
            <Link href="/" className="press-link">
              run a check →
            </Link>
          </div>
        ) : (
          <>
            <div className="reg-count press-label">
              {total} address{total === 1 ? '' : 'es'} on file
            </div>
            <div className="reg-table">
              <div className="reg-head">
                <span>Address</span>
                <span>What we found</span>
                <span>Last checked</span>
                <span>Views</span>
              </div>
              {reports.map((card) => (
                <RegisterRow key={card.address} card={card} />
              ))}
            </div>
          </>
        )}

        <Colophon />
      </div>

      <style>{`
        .reg-lead {
          padding: 44px 0 32px;
          max-width: 760px;
        }
        .reg-title {
          margin: 14px 0 0;
          font-size: clamp(34px, 5.4vw, 60px);
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .reg-lede {
          margin: 20px 0 0;
          font-family: var(--font-text);
          font-size: 18px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        .reg-count {
          margin-bottom: 12px;
        }
        .reg-table {
          border-top: 3px double var(--rule-strong);
          border-bottom: 1px solid var(--rule-strong);
        }
        .reg-head {
          display: grid;
          grid-template-columns: 2fr 2.6fr 1.1fr 0.5fr;
          gap: 20px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--rule-strong);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .reg-row {
          display: grid;
          grid-template-columns: 2fr 2.6fr 1.1fr 0.5fr;
          gap: 20px;
          align-items: center;
          padding: 14px 12px;
          border-bottom: 1px solid var(--rule);
          text-decoration: none;
          color: inherit;
          transition: background 0.12s;
        }
        .reg-row:hover { background: var(--oxblood-wash); }
        .reg-cell-label { display: none; }
        .reg-subject {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .reg-subject-name {
          font-size: 13px;
          color: var(--ink);
          overflow-wrap: anywhere;
        }
        .reg-chain {
          margin-left: 8px;
          padding: 1px 5px;
          border: 1px solid var(--rule-strong);
          font-size: 9.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
          vertical-align: middle;
        }
        .reg-subject-addr {
          font-size: 11px;
          color: var(--ink-faint);
        }
        .reg-flags { font-size: 12.5px; }
        .reg-found { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .reg-found-title { color: var(--ink); font-size: 14px; line-height: 1.3; display: flex; align-items: center; gap: 8px; }
        .reg-sev-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .reg-found-meta { font-size: 11px; color: var(--ink-soft); letter-spacing: 0.04em; }
        .reg-found--none { color: var(--ink-faint); font-size: 13px; font-style: italic; }
        .reg-legend { font-size: 11.5px; color: var(--ink-soft); margin-top: 10px; max-width: 70ch; line-height: 1.5; }
        .reg-filed { font-size: 12px; color: var(--ink-faint); }
        .reg-filed-val { display: flex; flex-direction: column; gap: 2px; }
        .reg-filed-count { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
        .reg-views { font-size: 12px; color: var(--ink-faint); text-align: right; }
        .reg-empty {
          padding: 48px 0;
          font-family: var(--font-text);
          font-size: 18px;
          color: var(--ink-soft);
        }

        @media (max-width: 720px) {
          .reg-head { display: none; }
          .reg-row {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 18px 4px;
          }
          .reg-cell {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 14px;
          }
          .reg-cell-label {
            display: inline-block;
            font-family: var(--font-mono), ui-monospace, monospace;
            font-size: 10px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--ink-faint);
            flex-shrink: 0;
          }
          .reg-subject { flex-direction: row; flex-wrap: wrap; }
          .reg-views { text-align: left; }
        }
      `}</style>
    </PressShell>
  );
}
