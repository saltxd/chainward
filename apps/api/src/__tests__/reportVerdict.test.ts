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

  it('is unknown, never pay, when the USDC balance could not be read', () => {
    const v = reportVerdict(
      { band: 'low-signal', flags: [] },
      { ...active, fetch_meta: { state_unavailable: ['usdc_balance'] } },
    );
    expect(v.label).toBe('unknown');
    expect(v.reason).toMatch(/USDC balance could not be read/);
  });

  it('is unknown when the decode data carries no activity block', () => {
    const v = reportVerdict({ band: 'low-signal', flags: [] }, {});
    expect(v.label).toBe('unknown');
    expect(v.reason).toBe('No transfers in the last 30 days on this chain.');
  });

  it('reads the lifetime sent count from the wallet nonce, so a quiet wallet reads Inactive', () => {
    const v = reportVerdict(
      { band: 'low-signal', flags: [] },
      { activity: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null }, wallet: { nonce: 43 } },
    );
    expect(v.text).toBe('Inactive');
    expect(v.reason).toMatch(/43 transactions sent in its lifetime/);
  });

  it('holds a sanctioned address even when the transfers or the USDC balance could not be read', () => {
    const ofac = {
      id: 'ofac_sanctioned',
      severity: 'high' as const,
      title: 'On the US sanctions list (OFAC)',
      evidence: 'This address is on the US Treasury OFAC SDN list. Paying it may be illegal for US persons.',
      source: 'https://sanctionssearch.ofac.treas.gov/',
    };
    for (const fetch_meta of [{ transfers_unavailable: 'every source failed' }, { state_unavailable: ['usdc_balance'] }]) {
      const v = reportVerdict({ band: 'high-signal', flags: [ofac] }, { ...active, fetch_meta });
      expect(v).toMatchObject({ label: 'hold', text: 'Hold' });
      expect(v.reason).toMatch(/US sanctions list \(OFAC\)/);
    }
  });

  it('names the transfer window the report read (14 days on BNB Chain), not a fixed 30', () => {
    const bsc = { ...active, fetch_meta: { window_days: 14 } };
    expect(reportVerdict({ band: 'low-signal', flags: [] }, bsc).reason).toMatch(/in the last 14 days,/);
    const quiet = {
      activity: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null },
      wallet: { nonce: 43 },
      fetch_meta: { window_days: 14 },
    };
    expect(reportVerdict({ band: 'low-signal', flags: [] }, quiet).reason).toBe(
      'No transfers in the last 14 days on this chain; 43 transactions sent in its lifetime.',
    );
    expect(reportVerdict({ band: 'low-signal', flags: [] }, active).reason).toMatch(/in the last 30 days,/);
  });

  it("says Couldn't check when the USDC balance could not be read", () => {
    const v = reportVerdict({ band: 'low-signal', flags: [] }, { ...active, fetch_meta: { state_unavailable: ['usdc_balance'] } });
    expect(v.text).toBe("Couldn't check");
  });
});
