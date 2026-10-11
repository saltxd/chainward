import { describe, expect, it } from 'vitest';
import { indexableReports } from '../indexableReports';

const row = (address: string, label: string | undefined, chain = 'base') => ({
  address,
  chain,
  ...(label ? { verdict: { label, text: label } } : {}),
  as_of_date: '2026-10-06',
});

describe('indexableReports', () => {
  it('keeps one URL per address and chain, judged by the newest report (library is newest first)', () => {
    // A re-check turned this wallet's answer to Inactive: the page is noindex, so the sitemap must not list it.
    const rows = [row('0xAAA', 'unknown'), row('0xaaa', 'hold')];
    expect(indexableReports(rows)).toEqual([]);
  });

  it('lists an address whose newest report answers Pay or Hold, once', () => {
    const rows = [row('0xbbb', 'hold'), row('0xBBB', 'unknown')];
    expect(indexableReports(rows).map((r) => r.address)).toEqual(['0xbbb']);
  });

  it('lists a Pay with no flags: the most useful pages are indexable', () => {
    expect(indexableReports([row('0xddd', 'pay')]).map((r) => r.address)).toEqual(['0xddd']);
  });

  it('leaves out a card with no verdict (an older API)', () => {
    expect(indexableReports([row('0xeee', undefined)])).toEqual([]);
  });

  it('treats base and bsc reports for one address as separate pages', () => {
    const rows = [row('0xccc', 'pay', 'base'), row('0xccc', 'hold', 'bsc')];
    expect(indexableReports(rows).map((r) => r.chain)).toEqual(['base', 'bsc']);
  });
});
