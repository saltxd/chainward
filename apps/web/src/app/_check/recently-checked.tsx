'use client';

import Link from 'next/link';
import { useApi } from '@/hooks/use-api';
import { publicApi, type RiskLibraryResult, type RiskSeverity } from '@/lib/api';
import { BAND_LABEL, reportPath } from '@/lib/risk';

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const SEV_VAR: Record<RiskSeverity, string> = {
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
};

/**
 * "Recently filed" — a compact ledger of the latest public reports. Social
 * proof, not a critical path: renders nothing while loading or on error so the
 * hero never shows a broken state. Data logic unchanged.
 */
export function RecentlyChecked() {
  const { data, loading, error } = useApi<RiskLibraryResult>(
    () => publicApi.listReports({ sort: 'recent', limit: 6 }),
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
        {data.reports.map((card) => (
          <li key={card.address} className="recent-row">
            <Link href={reportPath(card.address)} className="recent-link">
              <span className="recent-subject mono">
                {card.agent_name ?? truncate(card.address)}
              </span>
              <span
                className="recent-flags mono"
                style={{ color: card.top_severity ? SEV_VAR[card.top_severity] : 'var(--ink-faint)' }}
              >
                {card.top_severity
                  ? `${card.flag_count} flag${card.flag_count === 1 ? '' : 's'}`
                  : 'no signal'}
              </span>
              <span className="recent-band">{BAND_LABEL[card.band]}</span>
            </Link>
          </li>
        ))}
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
          grid-template-columns: 1fr auto auto;
          align-items: baseline;
          gap: 16px;
          padding: 11px 0;
          text-decoration: none;
          color: inherit;
        }
        .recent-link:hover .recent-subject {
          color: var(--oxblood);
        }
        .recent-subject {
          font-size: 13px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: color 0.15s;
        }
        .recent-flags {
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .recent-band {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
          text-align: right;
          min-width: 96px;
        }
        @media (max-width: 520px) {
          .recent-link { grid-template-columns: 1fr auto; }
          .recent-band { display: none; }
        }
      `}</style>
    </div>
  );
}
