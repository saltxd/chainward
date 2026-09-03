'use client';

/**
 * Presentation primitives for a risk report, filed on paper. INTEGRITY-critical:
 * these must never imply a safety verdict. There is no green "SAFE" tone for a
 * flag, no grade, no safety percentage, and signal_density is never rendered.
 * (Deep green is reserved for freshness/receipt marks only.)
 */

import type {
  RiskCoverage,
  RiskFlag,
  RiskFreshness,
  RiskProvenance,
  RiskSeverity,
} from '@/lib/api';
import {
  BAND_DESCRIPTION,
  BAND_LABEL,
  countBySeverity,
  zeroFlagsCopy,
} from '@/lib/risk';
import type { RiskBand } from '@/lib/api';

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

/** Neutral band header + severity-count breakdown. Flag counts, never a score. */
export function BandSummary({
  band,
  flags,
}: {
  band: RiskBand;
  flags: RiskFlag[];
}) {
  const counts = countBySeverity(flags);
  return (
    <div className="rr-band">
      <div className="rr-band-head">
        <span className="rr-band-tag">Signal band</span>
        <span className="rr-band-label">{BAND_LABEL[band]}</span>
      </div>
      <p className="rr-band-desc">{BAND_DESCRIPTION[band]}</p>
      <div className="rr-counts">
        {flags.length === 0 ? (
          <span className="rr-count-zero">{flags.length} flags raised</span>
        ) : (
          counts.map(({ severity, count }) => (
            <span key={severity} className={`rr-sev rr-sev--${severity}`}>
              {count} {SEVERITY_LABEL[severity]}
            </span>
          ))
        )}
      </div>
    </div>
  );
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
      {flags.map((flag) => (
        <li key={flag.id} className={`rr-flag rr-flag--${flag.severity}`}>
          <div className="rr-flag-head">
            <span className={`rr-sev rr-sev--${flag.severity}`}>
              {SEVERITY_LABEL[flag.severity]}
            </span>
            <span className="rr-flag-title">{flag.title}</span>
          </div>
          <p className="rr-flag-evidence">{flag.evidence}</p>
          {flag.source && (
            <a
              className="rr-flag-source"
              href={flag.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: {shortSource(flag.source)} →
            </a>
          )}
          <span className="rr-flag-id mono" aria-hidden>
            {flag.id}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What this check covered: every check that ran, raised or not, plus the window
 * it looked at. Rendered on every report so a quiet result is a list of things
 * examined. "not raised" is deliberate — never "passed" or "clear".
 */
export function CoverageBlock({ coverage }: { coverage: RiskCoverage | undefined }) {
  if (!coverage) return null;
  const raised = coverage.checks.filter((c) => c.raised).length;
  const quiet = coverage.checks.length - raised;
  const w = coverage.window;
  const latest = w.latest_transfer_at
    ? new Date(w.latest_transfer_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'none in window';
  return (
    <div className="rr-cov">
      <div className="rr-cov-head">
        <span className="rr-na-tag">What this check covered</span>
        <span className="rr-cov-tally mono">
          {coverage.checks.length} checks run · {raised} raised · {quiet} not raised
        </span>
      </div>
      <ul className="rr-cov-list">
        {coverage.checks.map((c) => (
          <li key={c.id} className={`rr-check ${c.raised ? 'rr-check--raised' : 'rr-check--quiet'}`}>
            <span className="rr-check-mark mono" aria-hidden>
              {c.raised ? '⚑' : '—'}
            </span>
            <span className="rr-check-body">
              <span className="rr-check-title">{c.title}</span>
              <span className="rr-check-what">{c.looks_for}</span>
            </span>
            <span className="rr-check-state mono">{c.raised ? 'raised' : 'not raised'}</span>
          </li>
        ))}
      </ul>
      <div className="rr-stats rr-cov-stats">
        <div className="rr-stat">
          <span className="rr-stat-label">transfers.scanned</span>
          <span className="rr-stat-value mono">
            {w.transfers_truncated ? '≥' : ''}
            {w.transfers_scanned.toLocaleString()}
          </span>
          <span className="rr-stat-unit">transfers scanned</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">transfers.30d</span>
          <span className="rr-stat-value mono">{w.transfers_30d.toLocaleString()}</span>
          <span className="rr-stat-unit">in the 30-day window</span>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-label">counterparties.30d</span>
          <span className="rr-stat-value mono">{w.unique_counterparties_30d.toLocaleString()}</span>
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
          <span className="rr-stat-unit">{w.survival} by activity</span>
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
 * names the public fallback otherwise; renders nothing for reports filed before
 * provenance was recorded.
 */
export function ProvenanceLine({ provenance }: { provenance: RiskProvenance | undefined }) {
  if (!provenance) return null;
  const lag = `${Math.round(provenance.head_lag_seconds)}s behind head`;
  const source =
    provenance.data_source === 'sentinel'
      ? 'Read from our own Base node'
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
