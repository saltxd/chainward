'use client';

import Link from 'next/link';
import { useApi } from '@/hooks/use-api';
import { publicApi, type RiskLibraryResult, type RiskReportCard, type RiskSeverity } from '@/lib/api';
import { reportPath } from '@/lib/risk';
import { VerdictStamp } from '@/components/press/VerdictStamp';
import { chainMeta } from '@/lib/chains';
import { isPlaceholderAddress } from '@/lib/params';
import { cardHeadline, plainFlagTitle } from '@/lib/cardFlag';

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
 * One filed case in brief: the answer first (PAY / HOLD / the third answer by
 * case), then who, the top flag surfaced, and when it was filed. The signal band
 * stays out of the list: the answer is what a visitor acts on.
 */
export function RecentRow({ card }: { card: RiskReportCard }) {
  const head = cardHeadline(card);
  const topFlag = head.flag;
  const sevColor = topFlag ? SEV_VAR[topFlag.severity] : 'var(--ink-faint)';
  const more = topFlag && head.more > 0 ? ` +${head.more} more` : '';
  return (
    <li className="recent-row">
      <Link href={reportPath(card.address, card.chain)} className="recent-link">
        <span className="recent-verdict">
          <VerdictStamp verdict={card.verdict} />
        </span>
        <span className="recent-main">
          <span className="recent-subject mono">
            {card.agent_name ?? truncate(card.address)}
            <span className="recent-chain">{chainMeta(card.chain).shortName}</span>
          </span>
          <span className="recent-finding">
            {topFlag ? (
              <>
                <span className="recent-sev-mark" style={{ background: sevColor }} aria-hidden />
                {plainFlagTitle(topFlag)}
                {more && <span className="recent-more mono">{more}</span>}
              </>
            ) : card.flag_count === 0 || head.known ? (
              // Only claim "no flags" when the count says so — an older
              // API payload without top_flags must not read as a clearance.
              <span className="recent-noflag">no flags raised in the window checked</span>
            ) : (
              <span className="recent-noflag">open the file for detail</span>
            )}
          </span>
        </span>
        <span className="recent-meta">
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
}

const FRESH_DAYS = 14;

/** Checks filed in the last `days` days, in the order given: an old list reads as a quiet site. */
export function freshCards(cards: RiskReportCard[], now: Date = new Date(), days: number = FRESH_DAYS): RiskReportCard[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return cards.filter((card) => new Date(card.as_of_date).getTime() >= cutoff);
}

/**
 * "Recent wallet checks": the latest public reports from the last 14 days, one
 * per address (distinct=address server-side so re-checks don't duplicate rows),
 * each row led by its answer. Social proof, not a critical path: renders nothing
 * while loading, on error, or when nothing recent was filed.
 */
export function RecentlyChecked() {
  const { data, loading, error } = useApi<RiskLibraryResult>(
    () => publicApi.listReports({ sort: 'recent', limit: 8, distinct: 'address' }),
    [],
  );

  const reports = freshCards(data?.reports.filter((card) => !isPlaceholderAddress(card.address)) ?? []).slice(0, 5);
  if (loading || error || reports.length === 0) {
    return null;
  }

  return (
    <div className="recent">
      <div className="recent-head">
        <span className="press-label">Recent wallet checks</span>
        <Link href="/reports" className="press-link">
          The full record →
        </Link>
      </div>
      <ul className="recent-list">
        {reports.map((card) => (
          <RecentRow key={`${card.chain ?? 'base'}:${card.address}`} card={card} />
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
          grid-template-columns: 9.5em minmax(0, 1fr) auto 18px;
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
        .recent-chain {
          margin-left: 8px;
          padding: 1px 5px;
          border: 1px solid var(--rule-strong);
          font-size: 9.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
          vertical-align: middle;
        }
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
        .recent-verdict {
          display: flex;
          align-items: center;
        }
        .recent-more {
          font-size: 11px;
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
