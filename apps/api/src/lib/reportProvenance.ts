/**
 * Per-report RPC provenance, lifted out of the persisted decode data so the
 * public report payload can state which source actually served it.
 *
 * The decode engine (packages/decode quick-decode) records `fetch_meta.data_source`
 * ('sentinel' = our own node, 'fallback' = public Base RPC) and the source's head
 * lag at fetch time. Reports written before that existed have neither, and the
 * payload simply omits provenance rather than guessing.
 */

export type ReportDataSource = 'sentinel' | 'fallback';

export interface ReportProvenance {
  data_source: ReportDataSource;
  head_lag_seconds: number;
}

export function extractProvenance(reportData: unknown): ReportProvenance | undefined {
  if (!reportData || typeof reportData !== 'object') return undefined;
  const meta = (reportData as { fetch_meta?: unknown }).fetch_meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const { data_source, head_lag_seconds } = meta as {
    data_source?: unknown;
    head_lag_seconds?: unknown;
  };
  if (data_source !== 'sentinel' && data_source !== 'fallback') return undefined;
  if (typeof head_lag_seconds !== 'number' || !Number.isFinite(head_lag_seconds)) return undefined;
  return { data_source, head_lag_seconds };
}
