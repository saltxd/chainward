import { describe, expect, it } from 'vitest';
import { reportVerdict } from '../lib/reportVerdict';

// The counterparty report opens with Pay / Hold / Unknown, derived from the
// stored assessment and the decode's activity numbers, never from the band alone.

const flag = (severity: 'high' | 'medium' | 'low' | 'info', title: string) => ({
  id: title.toLowerCase().replace(/\s+/g, '_'),
  severity,
  title,
  evidence: `${title} evidence`,
  source: 'https://example.test',
});

const active = {
  activity: { transfers_30d: 212, unique_counterparties_30d: 41, latest_transfer_age_hours: 3 },
  fetch_meta: {},
};

describe('reportVerdict', () => {
  it('pays an active address with no high flag', () => {
    const v = reportVerdict({ band: 'low-signal', flags: [flag('info', 'Smart account')] }, active);
    expect(v.label).toBe('pay');
    expect(v.reason).toMatch(/212 transfers with 41 counterparties/);
  });

  it('holds on a high-severity flag', () => {
    const v = reportVerdict({ band: 'elevated', flags: [flag('high', 'Stranded value')] }, active);
    expect(v).toMatchObject({ label: 'hold', reason: 'Stranded value: Stranded value evidence.' });
  });

  it('is unknown when the transfer list could not be read, whatever the band says', () => {
    const v = reportVerdict(
      { band: 'low-signal', flags: [] },
      { ...active, fetch_meta: { transfers_unavailable: 'every source failed' } },
    );
    expect(v.label).toBe('unknown');
  });

  it('is unknown when the decode data carries no activity block', () => {
    const v = reportVerdict({ band: 'low-signal', flags: [] }, {});
    expect(v.label).toBe('unknown');
    expect(v.reason).toBe('No transfers in the last 30 days on this chain.');
  });
});
