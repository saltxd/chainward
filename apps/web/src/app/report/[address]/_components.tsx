'use client';

import { useEffect, useState } from 'react';

/**
 * Presentation primitives for a risk report, filed on paper. INTEGRITY-critical:
 * nothing here says "safe". The answer card carries the server's Pay / Hold /
 * Unknown decision (Pay may wear the seal green: it means nothing was found
 * against paying, and the card says so). A flag is never green, there is no
 * grade or safety percentage, and signal_density is never rendered.
 */

import type {
  RiskCoverage,
  RiskFlag,
  RiskFreshness,
  RiskProvenance,
  RiskSeverity,
} from '@/lib/api';
import { windowLabel, zeroFlagsCopy } from '@/lib/risk';
import { tidyNumbers, transferHistoryUrl, type PlainAnswer } from '@/lib/plainAnswer';
import { CHECK_STEPS, progressStep } from '@/lib/checkProgress';
import { chainMeta } from '@/lib/chains';
import { counterpartyCheckUrl, PAID_CHECK_PRICE } from '@/lib/paidChecks';
import { PayCheckButton } from '@/components/pay/PayCheckButton';

function shortSource(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'info',
};

/**
 * The first thing on a report: the decision, big and in its color, what it means
 * in plain words, the one reason, how much was checked, and the limit.
 */
export function AnswerCard({
  answer,
  onRecheck,
  recheckLoading,
}: {
  answer: PlainAnswer;
  onRecheck: () => void;
  recheckLoading: boolean;
}) {
  const cameUp = answer.raised === 0 ? 'nothing came up' : `${answer.raised} came up`;
  return (
    <section className={`rr-answer rr-answer--${answer.label}`} aria-label="The answer">
      <div className="rr-answer-top">
        <div className="rr-answer-stamp" aria-label={`Verdict: ${answer.word}`}>
          <span className="rr-answer-stamp-word">{answer.word}</span>
          <span className="rr-answer-stamp-sub">Verdict · on-chain</span>
        </div>
        <p className="rr-answer-headline press-display">{answer.headline}</p>
      </div>
      <p className="rr-answer-why">
        <span className="rr-answer-why-tag">Why:</span> {answer.why}
      </p>
      <p className="rr-answer-meta">
        We checked {answer.checked} {answer.checked === 1 ? 'thing' : 'things'} · {cameUp} · details below
      </p>
      <p className="rr-answer-limit">{answer.limit}</p>
      <div className="rr-answer-foot">
        <span>Checked {answer.checkedAgo}</span>
        {answer.stale && (
          <button className="press-btn press-btn--ghost" onClick={onRecheck} disabled={recheckLoading}>
            {recheckLoading ? 'Re-checking…' : 'Re-check (free) →'}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * What a running check is doing, one step at a time, like a status line: the
 * steps done, the one running, the ones to come, and the seconds so far.
 */
export function CheckProgress({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - startedAt);
  const current = progressStep(elapsed);
  return (
    <div className="rr-progress" role="status" aria-live="polite">
      <ol className="rr-progress-steps">
        {CHECK_STEPS.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'now' : 'next';
          return (
            <li key={step} className={`rr-progress-step rr-progress-step--${state}`}>
              <span className="rr-progress-mark" aria-hidden>
                {state === 'done' ? '✓' : state === 'now' ? '' : '·'}
              </span>
              {step}
              {state === 'now' ? '…' : ''}
            </li>
          );
        })}
      </ol>
      <p className="rr-progress-time">
        {Math.floor(elapsed / 1000)}s · usually under a minute. The answer appears here by itself.
      </p>
    </div>
  );
}

/** Plain wording for flags whose stored title is written for us, not for the reader. */
function plainFlag(flag: RiskFlag): { title: string; evidence: string } {
  if (flag.id === 'activity_truncated') {
    const n = flag.evidence.match(/Fetched (\d+)/)?.[1];
    return {
      title: n ? `Busy wallet: we read its newest ${tidyNumbers(n)} transfers` : 'Busy wallet: we read its newest transfers',
      evidence: 'It has more than that, so the activity counts here are a floor, not its lifetime total. Not a problem in itself.',
    };
  }
  return { title: flag.title, evidence: tidyNumbers(flag.evidence) };
}

/** The flag list. Zero flags renders the neutral copy — NEVER "safe". */
export function FlagList({
  flags,
  coverage,
}: {
  flags: RiskFlag[];
  coverage?: RiskCoverage;
}) {
  if (flags.length === 0) {
    return (
      <div className="rr-noflags">
        <span className="rr-noflags-mark" aria-hidden>
          §
        </span>
        <p>{zeroFlagsCopy(coverage)}</p>
        <span className="rr-noflags-note">
          This is not a clearance. What was checked is listed below; what this
          check does not cover is in the not-assessed section.
        </span>
      </div>
    );
  }

  return (
    <ul className="rr-flags">
      {flags.map((flag) => {
        const plain = plainFlag(flag);
        const href = flag.source ? transferHistoryUrl(flag.source) : '';
        const showsTransfers = href !== flag.source;
        return (
        <li key={flag.id} className={`rr-flag rr-flag--${flag.severity}`}>
          <div className="rr-flag-head">
            <span className={`rr-sev rr-sev--${flag.severity}`}>
              {SEVERITY_LABEL[flag.severity]}
            </span>
            <span className="rr-flag-title">{plain.title}</span>
          </div>
          <p className="rr-flag-evidence">{plain.evidence}</p>
          {flag.source && (
            <a
              className="rr-flag-source"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {showsTransfers ? 'See the transfers on' : 'Source:'} {shortSource(flag.source)} →
            </a>
          )}
          <span className="rr-flag-id mono" aria-hidden>
            {flag.id}
          </span>
        </li>
        );
      })}
    </ul>
  );
}

/**
 * What this check covered: every check that ran, raised or not, plus the window
 * it looked at. Rendered on every report so a quiet result is a list of things
 * examined. "not raised" is deliberate — never "passed" or "clear". A check
 * whose input could not be read is "not assessed", with the reason, never
 * "not raised", and transfer figures that were never read show as a dash.
 */
const CHECK_STATE = {
  raised: { cls: 'rr-check--raised', mark: '⚑', label: 'raised' },
  not_raised: { cls: 'rr-check--quiet', mark: '—', label: 'not raised' },
  not_assessed: { cls: 'rr-check--na', mark: '?', label: 'not assessed' },
} as const;

export function CoverageBlock({ coverage }: { coverage: RiskCoverage | undefined }) {
  if (!coverage) return null;
  // Reports served before statuses existed only carry `raised`.
  const statusOf = (c: RiskCoverage['checks'][number]) => c.status ?? (c.raised ? 'raised' : 'not_raised');
  const count = (s: keyof typeof CHECK_STATE) => coverage.checks.filter((c) => statusOf(c) === s).length;
  const raised = count('raised');
  const quiet = count('not_raised');
  const unassessed = count('not_assessed');
  const w = coverage.window;
  const unread = w.transfers_unavailable;
  const win = windowLabel(w.days);
  // Reports without a recorded window are the 30-day Base path; keep its labels.
  const bounded = w.days !== undefined;
  const figure = (n: number) => (unread ? '—' : n.toLocaleString());
  const latest = unread
    ? '—'
    : w.latest_transfer_at
      ? new Date(w.latest_transfer_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : 'none in window';
  return (
    <div className="rr-cov">
      <div className="rr-cov-head">
        <span className="rr-na-tag">What this check covered</span>
        <span className="rr-cov-tally mono">
          {raised + quiet} checks run · {raised} raised · {quiet} not raised
          {unassessed > 0 ? ` · ${unassessed} not assessed` : ''}
        </span>
      </div>
      {unread && (
        <p className="rr-cov-unread">
          The transfer list could not be read for this report, so the checks that need it were not
          assessed. {unread}
        </p>
      )}
      {(w.state_unavailable ?? []).length > 0 && (
        <p className="rr-cov-unread">
          {coverage.checks
            .filter((c) => statusOf(c) === 'not_assessed' && c.reason && !c.reason.startsWith(unread ?? '\u0000'))
            .map((c) => c.reason)
            .filter((r, i, all) => all.indexOf(r) === i)
            .join(' ') || 'A state value (balance, transaction count or contract code) could not be read, so the checks that rest on it were not assessed.'}
        </p>
      )}
      <ul className="rr-cov-list">
        {coverage.checks.map((c) => {
          const s = CHECK_STATE[statusOf(c)];
          return (
            <li key={c.id} className={`rr-check ${s.cls}`}>
              <span className="rr-check-mark mono" aria-hidden>
                {s.mark}
              </span>
              <span className="rr-check-body">
                <span className="rr-check-title">{c.title}</span>
                <span className="rr-check-what">{c.looks_for}</span>
              </span>
              <span className="rr-check-state mono">{s.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="rr-stats rr-cov-stats">
        <div className="rr-stat">
          <span className="rr-stat-label">transfers.scanned</span>
          <span className="rr-stat-value mono">
            {w.transfers_truncated && !unread ? '≥' : ''}
            {figure(w.transfers_scanned)}
          </span>
          <span className="rr-stat-unit">{unread ? 'not read' : 'transfers scanned'}</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">{bounded ? 'transfers.window' : 'transfers.30d'}</span>
          <span className="rr-stat-value mono">{figure(w.transfers_30d)}</span>
          <span className="rr-stat-unit">in the {win} window</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">{bounded ? 'counterparties.window' : 'counterparties.30d'}</span>
          <span className="rr-stat-value mono">{figure(w.unique_counterparties_30d)}</span>
          <span className="rr-stat-unit">unique counterparties</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">txs.sent</span>
          <span className="rr-stat-value mono">{w.sent_tx_count.toLocaleString()}</span>
          <span className="rr-stat-unit">lifetime, from nonce</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">last.transfer</span>
          <span className="rr-stat-value mono">{latest}</span>
          <span className="rr-stat-unit">most recent seen</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">wallet.type</span>
          <span className="rr-stat-value mono">{w.wallet_type}</span>
          <span className="rr-stat-unit">{unread ? 'activity not read' : `${w.survival} by activity`}</span>
        </div>
      </div>
    </div>
  );
}

/** Freshness stamp — always shows as_of_block + generated_at + ttl state. */
export function FreshnessStamp({ freshness }: { freshness: RiskFreshness }) {
  const stale = freshness.ttl_state === 'stale';
  return (
    <div className="rr-fresh">
      <span className="rr-fresh-item">
        <span className="rr-fresh-key">Block</span>
        <span className="rr-fresh-val">
          {freshness.as_of_block.toLocaleString()}
        </span>
      </span>
      <span className="rr-fresh-item">
        <span className="rr-fresh-key">Generated</span>
        <span className="rr-fresh-val">
          {new Date(freshness.generated_at).toLocaleString()}
        </span>
      </span>
      <span className="rr-fresh-item">
        <span className="rr-fresh-key">Freshness</span>
        <span className={`rr-chip ${stale ? 'rr-chip--amber' : 'rr-chip--fresh'}`}>
          {stale ? 'stale' : 'fresh'}
        </span>
      </span>
    </div>
  );
}

/**
 * Which RPC served this report — the per-report, data-driven version of the
 * "own node" claim. Says so only when the decode actually read from our node;
 * names the public fallback otherwise; on chains where we run no node (BSC) it
 * names the public RPC plainly; renders nothing for reports filed before
 * provenance was recorded.
 */
export function ProvenanceLine({
  provenance,
  chain,
}: {
  provenance: RiskProvenance | undefined;
  chain?: string;
}) {
  if (!provenance) return null;
  const lag = `${Math.round(provenance.head_lag_seconds)}s behind head`;
  const source =
    provenance.data_source === 'sentinel'
      ? 'Read from our own Base node'
      : provenance.data_source === 'public'
        ? `Read from a public ${chainMeta(chain).name} RPC (we run no ${chainMeta(chain).name} node)`
        : 'Read from a public Base RPC (our node was resyncing)';
  return (
    <p className="rr-classifier mono">
      {source} · {lag}
    </p>
  );
}

/** Required, always-rendered section: what this check does NOT assess. */
export function NotAssessed({ items }: { items: string[] }) {
  return (
    <div className="rr-na">
      <div className="rr-na-tag">Not assessed</div>
      <p className="rr-na-lede">
        These dimensions are outside the scope of an on-chain behavior check.
        Their absence from the flag list is not a clearance.
      </p>
      <ul className="rr-na-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** The disclaimer — must appear on every report page. */
export function HonestDisclaimer({ text }: { text: string }) {
  return <div className="rr-disclaimer">{text}</div>;
}

/** Next to the free report: a check run now, paid per check from the reader's wallet. */
export function FreshPaidCheck({ address, chain }: { address: string; chain: 'base' | 'bsc' }) {
  return (
    <div>
      <span className="press-label">Fresh paid check</span>
      <p className="rr-classifier">
        A new check of this address, no older than 24h, paid per check. The free report above stays public.
      </p>
      <PayCheckButton
        resource={counterpartyCheckUrl(address, chain)}
        label={`Counterparty check for ${address.slice(0, 6)}…${address.slice(-4)}`}
        price={PAID_CHECK_PRICE.counterparty}
      />
    </div>
  );
}
