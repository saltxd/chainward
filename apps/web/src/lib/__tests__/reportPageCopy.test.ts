import { describe, expect, it } from 'vitest';
import type { RiskReport } from '../api';
import { reportPageCopy } from '../reportPageCopy';

// One title for a report, on the server (metadata) and in the tab after a client
// re-check: the question, then the answer word and why.

const NOW = new Date('2026-10-11T18:00:00Z');
const at = { short: '0x4baa…3bb2', chainName: 'Base', now: NOW };

function report(over: Partial<RiskReport> = {}): RiskReport {
  return {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    band: 'low-signal',
    flags: [],
    not_assessed: [],
    freshness: { as_of_block: 1, generated_at: '2026-10-11T17:00:00Z', ttl_state: 'fresh' },
    coverage: {
      checks: [],
      window: {
        transfers_scanned: 0,
        transfers_truncated: false,
        transfers_30d: 0,
        unique_counterparties_30d: 0,
        latest_transfer_at: null,
        sent_tx_count: 43,
        wallet_type: 'eoa',
        survival: 'dormant',
      },
    },
    classifier_version: '1',
    view_count: 0,
    disclaimer: '',
    ...over,
  } as RiskReport;
}

describe('reportPageCopy', () => {
  it('Hold: the question, then the answer and the flag behind it', () => {
    const c = reportPageCopy({
      ...at,
      report: report({ verdict: { label: 'hold', text: 'Hold', reason: 'Wallet is dormant: no transfers.', limits: '' } }),
    });
    expect(c.title).toBe('Should you pay 0x4baa…3bb2? Hold: Wallet is dormant');
  });

  it('too little to judge: uses the word the page shows, not "Unknown"', () => {
    const c = reportPageCopy({
      ...at,
      report: report({ verdict: { label: 'unknown', text: 'Unknown', reason: 'No transfers in the last 30 days.', limits: '' } }),
    });
    expect(c.title).toBe('Should you pay 0x4baa…3bb2? Inactive: nothing recent to go on');
    expect(c.description).toMatch(/^Inactive\. This wallet has sent 43 transactions/);
  });

  it('no report yet: offers the free check', () => {
    expect(reportPageCopy({ ...at, report: null }).title).toBe('Should you pay 0x4baa…3bb2? Free check');
  });
});
