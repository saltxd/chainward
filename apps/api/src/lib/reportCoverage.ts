import { riskChecksFor, type DecodeChain } from '@chainward/decode';

/**
 * "What this check covered" — the per-report coverage block. Turns a quiet
 * result (zero or one flag, which is most reports) into a statement of what was
 * examined and over what window, instead of an absence.
 *
 * Built from the persisted decode data; never invents a number. Returns
 * undefined when the data is missing the fields it needs.
 */

/**
 * raised / not_raised: the check ran on what it needs. not_assessed: an input it
 * needs could not be read (every transfer source failed), so it did not run.
 */
export type ReportCheckStatus = 'raised' | 'not_raised' | 'not_assessed';

export interface ReportCoverageCheck {
  id: string;
  title: string;
  looks_for: string;
  raised: boolean;
  status: ReportCheckStatus;
  /** Why the check was not assessed (only with status not_assessed). */
  reason?: string;
}

export interface ReportCoverage {
  checks: ReportCoverageCheck[];
  window: {
    /**
     * Set when every transfer source failed: the transfer figures below are
     * unknown, not zero. Public-safe text naming the sources and their errors.
     */
    transfers_unavailable?: string;
    /** Days the transfer scan covered. Absent = the full 30-day activity horizon. */
    days?: number;
    transfers_scanned: number;
    transfers_truncated: boolean;
    transfers_30d: number;
    unique_counterparties_30d: number;
    latest_transfer_at: string | null;
    sent_tx_count: number;
    wallet_type: string;
    survival: string;
  };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * The reason the report's transfer list could not be read (every source failed),
 * or undefined when it was read. A report like this must not be sold: its
 * activity, survival and absence checks were not assessed.
 */
export function transfersUnavailable(reportData: unknown): string | undefined {
  if (!reportData || typeof reportData !== 'object') return undefined;
  const reason = (reportData as { fetch_meta?: { transfers_unavailable?: unknown } }).fetch_meta?.transfers_unavailable;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}

export function buildCoverage(
  reportData: unknown,
  flags: readonly { id: string }[],
): ReportCoverage | undefined {
  if (!reportData || typeof reportData !== 'object') return undefined;
  const d = reportData as {
    chain?: unknown;
    wallet?: { type?: unknown; nonce?: unknown };
    activity?: {
      transfers_30d?: unknown;
      unique_counterparties_30d?: unknown;
      latest_transfer_at?: unknown;
    };
    fetch_meta?: { transfers_fetched?: unknown; transfers_truncated?: unknown; window_days?: unknown };
    survival?: { classification?: unknown };
  };
  const chain: DecodeChain = d.chain === 'bsc' ? 'bsc' : 'base';
  const windowDays = num(d.fetch_meta?.window_days);
  const transfers_scanned = num(d.fetch_meta?.transfers_fetched);
  const transfers_30d = num(d.activity?.transfers_30d);
  const unique_counterparties_30d = num(d.activity?.unique_counterparties_30d);
  const sent_tx_count = num(d.wallet?.nonce);
  if (
    transfers_scanned === undefined ||
    transfers_30d === undefined ||
    unique_counterparties_30d === undefined ||
    sent_tx_count === undefined
  ) {
    return undefined;
  }
  const raised = new Set(flags.map((f) => f.id));
  const latest = d.activity?.latest_transfer_at;
  const unread = transfersUnavailable(reportData);
  return {
    // Only the checks that ran on this chain — Base-only ones are not listed as
    // "not raised" off Base, because they were never evaluated.
    checks: riskChecksFor(chain, windowDays).map((c): ReportCoverageCheck => {
      const base = { id: c.id, title: c.title, looks_for: c.looks_for };
      if (unread && c.reads_transfers) return { ...base, raised: false, status: 'not_assessed', reason: unread };
      return raised.has(c.id) ? { ...base, raised: true, status: 'raised' } : { ...base, raised: false, status: 'not_raised' };
    }),
    window: {
      ...(unread ? { transfers_unavailable: unread } : {}),
      ...(windowDays !== undefined ? { days: windowDays } : {}),
      transfers_scanned,
      transfers_truncated: d.fetch_meta?.transfers_truncated === true,
      transfers_30d,
      unique_counterparties_30d,
      latest_transfer_at: typeof latest === 'string' ? latest : null,
      sent_tx_count,
      wallet_type: typeof d.wallet?.type === 'string' ? d.wallet.type : 'unknown',
      survival: typeof d.survival?.classification === 'string' ? d.survival.classification : 'unknown',
    },
  };
}
