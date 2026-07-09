'use client';

/**
 * Presentation primitives for a risk report, filed on paper. INTEGRITY-critical:
 * these must never imply a safety verdict. There is no green "SAFE" tone for a
 * flag, no grade, no safety percentage, and signal_density is never rendered.
 * (Deep green is reserved for freshness/receipt marks only.)
 */

import type { RiskFlag, RiskFreshness, RiskSeverity } from '@/lib/api';
import {
  BAND_DESCRIPTION,
  BAND_LABEL,
  countBySeverity,
  ZERO_FLAGS_COPY,
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
export function FlagList({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rr-noflags">
        <span className="rr-noflags-mark" aria-hidden>
          §
        </span>
        <p>{ZERO_FLAGS_COPY}</p>
        <span className="rr-noflags-note">
          This is not a clearance. See the not-assessed section below for what
          this check does not cover.
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
