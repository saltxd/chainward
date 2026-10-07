import { describe, expect, it } from 'vitest';
import { indexableReports } from '../indexableReports';

const row = (address: string, band: string, flag_count: number, chain = 'base') => ({ address, chain, band, flag_count, as_of_date: '2026-10-06' });

describe('indexableReports', () => {
  it('keeps one URL per address and chain, judged by the newest report (library is newest first)', () => {
    // A re-check turned this wallet thin: the page is noindex, so the sitemap must not list it.
    const rows = [row('0xAAA', 'low-signal', 0), row('0xaaa', 'mixed', 1)];
    expect(indexableReports(rows)).toEqual([]);
  });

  it('lists an address whose newest report is indexable, once', () => {
    const rows = [row('0xbbb', 'mixed', 1), row('0xBBB', 'low-signal', 0)];
    expect(indexableReports(rows).map((r) => r.address)).toEqual(['0xbbb']);
  });

  it('treats base and bsc reports for one address as separate pages', () => {
    const rows = [row('0xccc', 'mixed', 1, 'base'), row('0xccc', 'mixed', 2, 'bsc')];
    expect(indexableReports(rows).map((r) => r.chain)).toEqual(['base', 'bsc']);
  });
});
