import { isThinReport } from './risk';
import type { RiskBand } from './api';

export interface LibraryRow {
  address: string;
  chain?: string | null;
  band: string;
  flag_count: number;
  as_of_date: string;
}

/**
 * Which library rows the sitemap may list: one per (chain, address), judged by
 * the newest report for that page (the library is newest first). A re-check
 * can turn a wallet thin; the page then renders noindex, so the older,
 * flagged row must not put the URL back into the sitemap.
 */
export function indexableReports<T extends LibraryRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${r.chain ?? 'base'}:${r.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isThinReport(r.flag_count, r.band as RiskBand)) continue;
    out.push(r);
  }
  return out;
}
