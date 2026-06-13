/**
 * Risk-Check presentation helpers — shared between the report page, the library
 * grid, and the OG image route. Encodes the INTEGRITY rules in one place:
 *
 *   - Bands are neutral descriptors of signal volume, NEVER a safety verdict.
 *   - Severity maps to the v2 palette (danger / amber / cyan), never a green
 *     "safe" tone. There is no SAFE band, no letter grade, no safety %.
 *   - signal_density is never surfaced.
 */

import type { RiskBand, RiskSeverity } from './api';

export const DISCLAIMER =
  'Risk flags from on-chain behavior only. ChainWard cannot see social engineering, ' +
  'off-chain agreements, or intent. Absence of flags is not a guarantee of safety.';

// Neutral, human copy for each band. Deliberately avoids safe/risky language.
export const BAND_LABEL: Record<RiskBand, string> = {
  'low-signal': 'low signal',
  mixed: 'mixed signal',
  elevated: 'elevated signal',
  'high-signal': 'high signal',
};

export const BAND_DESCRIPTION: Record<RiskBand, string> = {
  'low-signal':
    'Few flags surfaced from on-chain behavior in the window checked. This is a description of signal volume, not a safety verdict.',
  mixed:
    'A mix of flags surfaced from on-chain behavior in the window checked. This is a description of signal volume, not a safety verdict.',
  elevated:
    'Several flags surfaced from on-chain behavior in the window checked. This is a description of signal volume, not a safety verdict.',
  'high-signal':
    'Many flags surfaced from on-chain behavior in the window checked. This is a description of signal volume, not a safety verdict.',
};

// v2 Badge tones — explicitly no phosphor/green tone for any severity, so a
// flag can never read as a green "all clear".
export type V2Tone = 'neutral' | 'phosphor' | 'amber' | 'danger' | 'cyan';

export const SEVERITY_TONE: Record<RiskSeverity, V2Tone> = {
  high: 'danger',
  medium: 'amber',
  low: 'cyan',
  info: 'neutral',
};

export const SEVERITY_RANK: Record<RiskSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const SEVERITY_ORDER: RiskSeverity[] = ['high', 'medium', 'low', 'info'];

/** Counts by severity, in display order (high → info). */
export function countBySeverity(
  flags: { severity: RiskSeverity }[],
): { severity: RiskSeverity; count: number }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    count: flags.filter((f) => f.severity === severity).length,
  })).filter((entry) => entry.count > 0);
}

// Hex equivalents of the v2 severity tones — for the OG route, which cannot use
// CSS variables. Kept in sync with v2-tokens.css.
export const SEVERITY_HEX: Record<RiskSeverity, string> = {
  high: '#e66767', // --danger
  medium: '#e8a033', // --amber
  low: '#5ec4e6', // --cyan
  info: '#9ba397', // --fg-dim
};

export const ZERO_FLAGS_COPY =
  'No flags raised from on-chain behavior in the window checked.';

/** The FE report route. The backend's report_url uses /risk/report; the web app
 * serves these at /report. Canonical, lowercased address. */
export function reportPath(address: string): string {
  return `/report/${address.toLowerCase()}`;
}

/** A report is "thin" (noindex) when it has zero flags AND low signal — i.e. an
 * empty/quiet wallet with nothing to index. */
export function isThinReport(flagCount: number, band: RiskBand): boolean {
  return flagCount === 0 && band === 'low-signal';
}

export function topSeverity(
  flags: { severity: RiskSeverity }[],
): RiskSeverity | null {
  let top: RiskSeverity | null = null;
  for (const f of flags) {
    if (top === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[top]) {
      top = f.severity;
    }
  }
  return top;
}
