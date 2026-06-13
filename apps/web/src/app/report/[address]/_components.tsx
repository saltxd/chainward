'use client';

/**
 * Presentation primitives for a risk report. INTEGRITY-critical: these are the
 * components that must never imply a safety verdict. There is no green "SAFE"
 * tone, no grade, no safety percentage, and signal_density is never rendered.
 */

import { Badge } from '@/components/v2';
import type { RiskFlag, RiskFreshness } from '@/lib/api';
import {
  BAND_DESCRIPTION,
  BAND_LABEL,
  countBySeverity,
  SEVERITY_TONE,
  ZERO_FLAGS_COPY,
  type V2Tone,
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

const SEVERITY_LABEL: Record<RiskFlag['severity'], string> = {
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
    <div className="v2-rr-band">
      <div className="v2-rr-band-head">
        <span className="v2-rr-band-tag">// signal band</span>
        <Badge tone="neutral">{BAND_LABEL[band]}</Badge>
      </div>
      <p className="v2-rr-band-desc">{BAND_DESCRIPTION[band]}</p>
      <div className="v2-rr-counts">
        {flags.length === 0 ? (
          <span className="v2-rr-count-zero">{flags.length} flags raised</span>
        ) : (
          counts.map(({ severity, count }) => (
            <span key={severity} className="v2-rr-count">
              <Badge tone={SEVERITY_TONE[severity]}>
                {count} {SEVERITY_LABEL[severity]}
              </Badge>
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
      <div className="v2-rr-noflags">
        <span className="v2-rr-noflags-mark" aria-hidden>
          //
        </span>
        <p>{ZERO_FLAGS_COPY}</p>
        <span className="v2-rr-noflags-note">
          This is not a clearance. See the not-assessed section below for what
          this check does not cover.
        </span>
      </div>
    );
  }

  return (
    <ul className="v2-rr-flags">
      {flags.map((flag) => {
        const tone: V2Tone = SEVERITY_TONE[flag.severity];
        return (
          <li key={flag.id} className={`v2-rr-flag v2-rr-flag-${tone}`}>
            <div className="v2-rr-flag-head">
              <Badge tone={tone}>{SEVERITY_LABEL[flag.severity]}</Badge>
              <span className="v2-rr-flag-title">{flag.title}</span>
            </div>
            <p className="v2-rr-flag-evidence">{flag.evidence}</p>
            {flag.source && (
              <a
                className="v2-rr-flag-source"
                href={flag.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                source: {shortSource(flag.source)} →
              </a>
            )}
            <span className="v2-rr-flag-id" aria-hidden>
              {flag.id}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Freshness stamp — always shows as_of_block + generated_at + ttl state. */
export function FreshnessStamp({ freshness }: { freshness: RiskFreshness }) {
  const stale = freshness.ttl_state === 'stale';
  return (
    <div className="v2-rr-fresh">
      <span className="v2-rr-fresh-item">
        <span className="v2-rr-fresh-key">block</span>
        <span className="v2-rr-fresh-val">
          {freshness.as_of_block.toLocaleString()}
        </span>
      </span>
      <span className="v2-rr-fresh-item">
        <span className="v2-rr-fresh-key">generated</span>
        <span className="v2-rr-fresh-val">
          {new Date(freshness.generated_at).toLocaleString()}
        </span>
      </span>
      <span className="v2-rr-fresh-item">
        <span className="v2-rr-fresh-key">freshness</span>
        <Badge tone={stale ? 'amber' : 'neutral'}>
          {stale ? 'stale' : 'fresh'}
        </Badge>
      </span>
    </div>
  );
}

/** Required, always-rendered section: what this check does NOT assess. */
export function NotAssessed({ items }: { items: string[] }) {
  return (
    <div className="v2-rr-na">
      <div className="v2-rr-na-tag">// not assessed</div>
      <p className="v2-rr-na-lede">
        These dimensions are outside the scope of an on-chain behavior check.
        Their absence from the flag list is not a clearance.
      </p>
      <ul className="v2-rr-na-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** The disclaimer — must appear on every report page. */
export function HonestDisclaimer({ text }: { text: string }) {
  return <div className="v2-rr-disclaimer">{text}</div>;
}
