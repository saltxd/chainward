'use client';

import Link from 'next/link';
import { useApi } from '@/hooks/use-api';
import { publicApi, type RiskLibraryResult, type RiskSeverity } from '@/lib/api';
import { BAND_LABEL, reportPath } from '@/lib/risk';

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

const SEV_VAR: Record<RiskSeverity, string> = {
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
};

/**
 * "Recently filed" — the latest public reports, one per address
 * (distinct=address server-side so re-checks don't duplicate rows). Each row
 * carries the case in brief: who, the top flag surfaced, how many flags, the
 * band, and when it was filed. Social proof, not a critical path: renders
 * nothing while loading or on error so the hero never shows a broken state.
 */
export function RecentlyChecked() {
  const { data, loading, error } = useApi<RiskLibraryResult>(
    () => publicApi.listReports({ sort: 'recent', limit: 5, distinct: 'address' }),
    [],
  );

  if (loading || error || !data || data.reports.length === 0) {
    return null;
  }

  return (
    <div className="recent">
      <div className="recent-head">
        <span className="press-label">Recently filed</span>
        <Link href="/reports" className="press-link">
          The full record →
        </Link>
      </div>
      <ul className="recent-list">
        {data.reports.map((card) => {
          const topFlag = card.top_flags?.[0] ?? null;
          const sevColor = card.top_severity
            ? SEV_VAR[card.top_severity]
            : 'var(--ink-faint)';
          return (
            <li key={card.address} className="recent-row">
              <Link href={reportPath(card.address)} className="recent-link">
                <span className="recent-main">
                  <span className="recent-subject mono">
                    {card.agent_name ?? truncate(card.address)}
                  </span>
                  <span className="recent-finding">
                    {topFlag ? (
                      <>
                        <span
                          className="recent-sev-mark"
                          style={{ background: sevColor }}
                          aria-hidden
                        />
                        {topFlag.title}
                      </>
                    ) : card.flag_count === 0 ? (
                      // Only claim "no flags" when the count says so — an older
                      // API payload without top_flags must not read as a clearance.
                      <span className="recent-noflag">
                        no flags raised in the window checked
                      </span>
                    ) : (
                      <span className="recent-noflag">open the file for detail</span>
                    )}
                  </span>
                </span>
                <span className="recent-meta">
                  <span className="recent-flags mono" style={{ color: sevColor }}>
                    {card.flag_count > 0
                      ? `${card.flag_count} flag${card.flag_count === 1 ? '' : 's'}`
                      : '0 flags'}
                  </span>
                  <span className="recent-band">{BAND_LABEL[card.band]}</span>
                  <span className="recent-when mono">
                    {timeAgo(card.as_of_date)}
                    {card.view_count > 1 ? ` · ${card.view_count} views` : ''}
                  </span>
                </span>
                <span className="recent-go" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <style>{`
        .recent {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid var(--rule);
        }
        .recent-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 6px;
        }
        .recent-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .recent-row {
          border-bottom: 1px solid var(--rule);
        }
        .recent-link {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto 18px;
          align-items: center;
          gap: 18px;
          padding: 12px 0;
          text-decoration: none;
          color: inherit;
        }
        .recent-main {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .recent-subject {
          font-size: 13px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: color 0.15s;
        }
        .recent-link:hover .recent-subject { color: var(--oxblood); }
        .recent-finding {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          font-family: var(--font-text);
          font-size: 15px;
          line-height: 1.35;
          color: var(--ink-soft);
        }
        .recent-sev-mark {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          transform: translateY(-1px);
        }
        .recent-noflag {
          font-style: italic;
          color: var(--ink-faint);
        }
        .recent-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
          text-align: right;
          flex-shrink: 0;
        }
        .recent-flags {
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .recent-band {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .recent-when {
          font-size: 10.5px;
          color: var(--ink-faint);
        }
        .recent-go {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
          color: transparent;
          transition: color 0.15s, transform 0.15s;
        }
        .recent-link:hover .recent-go {
          color: var(--oxblood);
          transform: translateX(2px);
        }
        @media (max-width: 560px) {
          .recent-link { grid-template-columns: minmax(0, 1fr); gap: 6px; }
          .recent-meta {
            flex-direction: row;
            align-items: baseline;
            gap: 12px;
            text-align: left;
          }
          .recent-go { display: none; }
        }
      `}</style>
    </div>
  );
}
