import Link from 'next/link';
import { reportPath, isThinReport } from '@/lib/risk';
import type { RiskReportCard, RiskSeverity } from '@/lib/api';
import { chainMeta } from '@/lib/chains';
import { VerdictStamp } from '@/components/press/VerdictStamp';

// The register on /reports: one row per address on file, led by its answer.
// The page around it (copy, layout, the .reg-* styles) lives in page.tsx.

const SEV_VAR: Record<RiskSeverity, string> = {
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
};

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function RegisterRow({ card }: { card: RiskReportCard }) {
  const thin = isThinReport(card.verdict);
  // The headline flag: the highest-severity one the API denormalised onto the card.
  const topFlag =
    card.top_flags?.[0] ??
    (card.top_severity ? { title: `${card.flag_count} flag${card.flag_count === 1 ? '' : 's'}`, severity: card.top_severity } : null);
  return (
    <Link
      href={reportPath(card.address, card.chain)}
      className="reg-row"
      // The third answer is deindexed at the page level; nofollow so crawlers
      // don't follow into it.
      rel={thin ? 'nofollow' : undefined}
    >
      <span className="reg-cell reg-subject">
        <span className="reg-cell-label">Address</span>
        <span className="reg-subject-name mono">
          {card.agent_name ?? truncate(card.address)}
          <span className="reg-chain">{chainMeta(card.chain).shortName}</span>
        </span>
        {card.agent_name && <span className="reg-subject-addr mono">{truncate(card.address)}</span>}
      </span>
      <span className="reg-cell reg-flags">
        <span className="reg-cell-label">Answer</span>
        <span className="reg-answer">
          <VerdictStamp verdict={card.verdict} />
          {topFlag ? (
            <span className="reg-found">
              <span className="reg-found-title">
                <span className="reg-sev-dot" style={{ background: SEV_VAR[topFlag.severity] }} aria-hidden="true" />
                {topFlag.title}
              </span>
              {card.flag_count > 1 && <span className="reg-found-meta mono">+{card.flag_count - 1} more</span>}
            </span>
          ) : (
            <span className="reg-found reg-found--none">Nothing flagged in the window checked</span>
          )}
        </span>
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

export function RegisterTable({ reports }: { reports: RiskReportCard[] }) {
  return (
    <div className="reg-table">
      <div className="reg-head">
        <span>Address</span>
        <span>Answer</span>
        <span>Last checked</span>
        <span>Views</span>
      </div>
      {reports.map((card) => (
        <RegisterRow key={`${card.chain ?? 'base'}:${card.address}`} card={card} />
      ))}
      <style>{`
        .reg-answer { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
        @media (max-width: 720px) {
          .reg-answer { align-items: flex-end; text-align: right; }
        }
      `}</style>
    </div>
  );
}
