'use client';

import Link from 'next/link';
import { Badge } from '@/components/v2';
import { useApi } from '@/hooks/use-api';
import { publicApi, type RiskLibraryResult } from '@/lib/api';
import { BAND_LABEL, reportPath, SEVERITY_TONE } from '@/lib/risk';

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * A compact "recently checked" strip on the home page. Pulls the latest public
 * reports from the library. Renders nothing while loading or on error so the
 * hero never shows a broken state — it's social proof, not a critical path.
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
    <div className="v2-recent">
      <div className="v2-recent-head">
        <span className="v2-recent-tag">// recently checked</span>
        <Link href="/reports" className="v2-recent-all">
          all reports →
        </Link>
      </div>
      <div className="v2-recent-list">
        {data.reports.map((card) => (
          <Link
            key={card.address}
            href={reportPath(card.address)}
            className="v2-recent-item"
          >
            <span className="v2-recent-addr">
              {card.agent_name ?? truncate(card.address)}
            </span>
            <span className="v2-recent-flags">
              {card.top_severity ? (
                <Badge tone={SEVERITY_TONE[card.top_severity]}>
                  {card.flag_count} flag{card.flag_count === 1 ? '' : 's'}
                </Badge>
              ) : (
                <span className="v2-recent-noflag">0 flags</span>
              )}
            </span>
            <span className="v2-recent-band">{BAND_LABEL[card.band]}</span>
          </Link>
        ))}
      </div>

      <style>{`
        .v2-recent {
          margin-top: 40px;
          padding-top: 28px;
          border-top: 1px solid var(--line);
        }
        .v2-recent-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .v2-recent-tag {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
        }
        .v2-recent-all {
          font-size: 11px;
          color: var(--phosphor);
          text-decoration: none;
          letter-spacing: 0.04em;
        }
        .v2-recent-all:hover { color: var(--fg); }
        .v2-recent-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 720px) {
          .v2-recent-list { grid-template-columns: 1fr; }
        }
        .v2-recent-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--line);
          background: var(--bg-1);
          text-decoration: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .v2-recent-item:hover {
          border-color: var(--phosphor-dim);
          background: var(--bg-2);
        }
        .v2-recent-addr {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--fg);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-recent-noflag {
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 0.06em;
        }
        .v2-recent-band {
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
