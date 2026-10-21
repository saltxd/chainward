import { riskChecksFor, STATE_READ_UNAVAILABLE, type DecodeChain } from '@chainward/decode';

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
    /** State reads (balance, nonce, code) that failed on every RPC. */
    state_unavailable?: string[];
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

/** State reads (balance, nonce, code) that failed on every RPC, as recorded by the decode. */
export function stateUnavailable(reportData: unknown): string[] {
  if (!reportData || typeof reportData !== 'object') return [];
  const list = (reportData as { fetch_meta?: { state_unavailable?: unknown } }).fetch_meta?.state_unavailable;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

/** The decoy check's status as the worker stored it (fetch_meta.decoy_check); undefined on reports filed before it existed. */
export function decoyCheckStatus(reportData: unknown): 'ran' | 'not_applicable' | 'unavailable' | undefined {
  if (!reportData || typeof reportData !== 'object') return undefined;
  const s = (reportData as { fetch_meta?: { decoy_check?: unknown } }).fetch_meta?.decoy_check;
  return s === 'ran' || s === 'not_applicable' || s === 'unavailable' ? s : undefined;
}

/** A wallet that never sent a transaction and has no code: the only kind that can be a planted look-alike. */
export function neverUsed(reportData: unknown): boolean {
  if (!reportData || typeof reportData !== 'object') return false;
  const w = (reportData as { wallet?: { nonce?: unknown; code_size?: unknown } }).wallet;
  return num(w?.nonce) === 0 && (num(w?.code_size) ?? 0) === 0;
}

export const DECOY_UNCHECKED_REASON = "The check for a planted look-alike couldn't run, so this never-used address can't be cleared.";

/**
 * Why this report must not be sold as complete: the transfer list or a state
 * value it rests on could not be read, or the decoy check could not run on a
 * never-used wallet (its fake transfers would read as activity). Undefined when
 * every source answered.
 */
export function sourcesUnavailable(reportData: unknown): string | undefined {
  const parts = [
    transfersUnavailable(reportData),
    ...stateUnavailable(reportData).map((k) => STATE_READ_UNAVAILABLE[k] ?? `The ${k} read failed.`),
    decoyCheckStatus(reportData) === 'unavailable' && neverUsed(reportData) ? DECOY_UNCHECKED_REASON : undefined,
  ].filter((x): x is string => Boolean(x));
  return parts.length ? parts.join(' ') : undefined;
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
  const stateUnread = stateUnavailable(reportData);
  return {
    // Only the checks that ran on this chain — Base-only ones are not listed as
    // "not raised" off Base, because they were never evaluated.
    checks: riskChecksFor(chain, windowDays).map((c): ReportCoverageCheck => {
      const base = { id: c.id, title: c.title, looks_for: c.looks_for };
      if (unread && c.reads_transfers) return { ...base, raised: false, status: 'not_assessed', reason: unread };
      const failedState = (c.reads_state ?? []).find((k) => stateUnread.includes(k));
      if (failedState) {
        return { ...base, raised: false, status: 'not_assessed', reason: STATE_READ_UNAVAILABLE[failedState] ?? `The ${failedState} read failed.` };
      }
      if (c.id === 'poisoning_decoy') {
        const decoy = decoyCheckStatus(reportData);
        if (decoy === 'unavailable') return { ...base, raised: false, status: 'not_assessed', reason: "The transfer index this check reads wasn't available." };
        // A wallet that sent transactions cannot be a decoy, so an older report's "not raised" stays true.
        if (decoy === undefined && neverUsed(reportData)) {
          return { ...base, raised: false, status: 'not_assessed', reason: 'Added after this report was filed. Re-check to run it.' };
        }
      }
      return raised.has(c.id) ? { ...base, raised: true, status: 'raised' } : { ...base, raised: false, status: 'not_raised' };
    }),
    window: {
      ...(unread ? { transfers_unavailable: unread } : {}),
      ...(stateUnread.length ? { state_unavailable: stateUnread } : {}),
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
