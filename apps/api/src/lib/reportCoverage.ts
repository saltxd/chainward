import { RISK_CHECKS } from '@chainward/decode';

/**
 * "What this check covered" — the per-report coverage block. Turns a quiet
 * result (zero or one flag, which is most reports) into a statement of what was
 * examined and over what window, instead of an absence.
 *
 * Built from the persisted decode data; never invents a number. Returns
 * undefined when the data is missing the fields it needs.
 */

export interface ReportCoverageCheck {
  id: string;
  title: string;
  looks_for: string;
  raised: boolean;
}

export interface ReportCoverage {
  checks: ReportCoverageCheck[];
  window: {
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

export function buildCoverage(
  reportData: unknown,
  flags: readonly { id: string }[],
): ReportCoverage | undefined {
  if (!reportData || typeof reportData !== 'object') return undefined;
  const d = reportData as {
    wallet?: { type?: unknown; nonce?: unknown };
    activity?: {
      transfers_30d?: unknown;
      unique_counterparties_30d?: unknown;
      latest_transfer_at?: unknown;
    };
    fetch_meta?: { transfers_fetched?: unknown; transfers_truncated?: unknown };
    survival?: { classification?: unknown };
  };
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
  return {
    checks: RISK_CHECKS.map((c) => ({
      id: c.id,
      title: c.title,
      looks_for: c.looks_for,
      raised: raised.has(c.id),
    })),
    window: {
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
