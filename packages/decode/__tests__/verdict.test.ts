import { describe, expect, it } from 'vitest';
import { counterpartyVerdict, hireVerdict, sellerVerdict } from '../src/verdict.js';

// Every paid check opens with one line a buyer can act on. The evidence and the
// limits stay underneath; the verdict never claims more than the check measured.

describe('hireVerdict', () => {
  const summary = (o: Partial<{ owner_linked: number; inconclusive: number; independent_within_limits: number }>) => ({
    owner_linked: 0,
    inconclusive: 0,
    independent_within_limits: 0,
    passes_three_independent: (o.independent_within_limits ?? 0) >= 3,
    ...o,
  });

  it('says hired by others when 3 or more hirers show no link to the owner', () => {
    const v = hireVerdict(summary({ independent_within_limits: 7 }), { distinct_hirers: 7, total: 7 }, 30);
    expect(v.label).toBe('hired_by_others');
    expect(v.text).toBe('Hired by others');
    expect(v.reason).toBe('7 of 7 hirers in the last 30 days show no funding link to the owner within 4 hops.');
    expect(v.limits).toMatch(/not proven independence/);
  });

  it('says hired by its own circle when the linked hirers outnumber the unlinked ones', () => {
    const v = hireVerdict(summary({ owner_linked: 4, independent_within_limits: 1 }), { distinct_hirers: 5, total: 9 }, 30);
    expect(v.label).toBe('hired_by_own_circle');
    expect(v.text).toBe('Hired by its own circle');
    expect(v.reason).toBe('4 of 5 hirers trace back to the owner or share its funder; 1 does not.');
  });

  it('says not enough data below 3 distinct hirers, whatever they look like', () => {
    const v = hireVerdict(summary({ independent_within_limits: 2 }), { distinct_hirers: 2, total: 2 }, 30);
    expect(v.label).toBe('not_enough_data');
    expect(v.text).toBe('Not enough data');
    expect(v.reason).toBe('2 distinct hirers in the last 30 days; the rule needs 3.');
  });

  it('says not enough data when the trails stop before they settle it', () => {
    const v = hireVerdict(summary({ inconclusive: 3, independent_within_limits: 1, owner_linked: 1 }), { distinct_hirers: 5, total: 5 }, 30);
    expect(v.label).toBe('not_enough_data');
    expect(v.reason).toBe('3 of 5 hirers could not be settled either way (same hub within a day, or untraced); 1 linked, 1 not.');
  });
});

describe('sellerVerdict', () => {
  const base = {
    buyers_checked: 30,
    seller_funded: { buyers: 0, volume_share: 0, hops: {} as Record<string, number> },
    paid_back_share: 0,
    via_intermediary_share: 0,
    proxied_payers: [] as Array<{ payers_resolved: number }>,
    signals: [] as Array<{ id: string }>,
    window_days: 30,
  };

  it('says real demand when no checked buyer traces back to the seller', () => {
    const v = sellerVerdict(base);
    expect(v.label).toBe('real_demand');
    expect(v.text).toBe('Real demand');
    expect(v.reason).toBe('None of the 30 top buyers checked traces back to this address within 4 hops, and it sent nothing back to them.');
  });

  it('says self-funded demand when most checked buyers trace back to the seller', () => {
    const v = sellerVerdict({
      ...base,
      seller_funded: { buyers: 29, volume_share: 0.97, hops: { '1': 10, '4': 19 } },
      signals: [{ id: 'buyers_funded_by_seller' }],
    });
    expect(v.label).toBe('self_funded_demand');
    expect(v.text).toBe('Self-funded demand');
    expect(v.reason).toBe('29 of 30 top buyers checked trace back to this address within 4 hops (97% of their volume).');
  });

  it('says self-funded demand when the seller pays its buyers back', () => {
    const v = sellerVerdict({ ...base, paid_back_share: 0.99, signals: [{ id: 'money_flows_back' }] });
    expect(v.label).toBe('self_funded_demand');
    expect(v.reason).toBe('Stablecoins sent back to its own buyers equal 99% of sampled inflow.');
  });

  it('says mixed when one funder or one buyer dominates but the money does not loop', () => {
    const v = sellerVerdict({ ...base, signals: [{ id: 'common_funder' }] });
    expect(v.label).toBe('mixed');
    expect(v.text).toBe('Mixed');
  });

  it('says not enough data with fewer than 5 buyers checked', () => {
    const v = sellerVerdict({ ...base, buyers_checked: 2 });
    expect(v.label).toBe('not_enough_data');
    expect(v.reason).toBe('Only 2 buyers could be checked in the last 30 days.');
  });

  it('says not enough data when most inflow comes through proxies whose payers were not named', () => {
    const v = sellerVerdict({ ...base, via_intermediary_share: 0.9 });
    expect(v.label).toBe('not_enough_data');
    expect(v.reason).toBe('90% of inflow arrived through facilitator proxies whose payers could not be named.');
  });
});

describe('counterpartyVerdict', () => {
  const flag = (severity: 'info' | 'low' | 'medium' | 'high', title: string, evidence = 'evidence') => ({
    id: title.toLowerCase().replace(/\s+/g, '_'),
    severity,
    title,
    evidence,
    source: 'https://example.test',
  });
  const activity = { transfers_30d: 212, unique_counterparties_30d: 41, latest_transfer_age_hours: 3 };

  it('says pay when the address is active and carries no high-severity flag', () => {
    const v = counterpartyVerdict({ band: 'low-signal', flags: [flag('info', 'Smart account')] }, activity);
    expect(v.label).toBe('pay');
    expect(v.text).toBe('Pay');
    expect(v.reason).toBe('Active: 212 transfers with 41 counterparties in the last 30 days, last one 3 hours ago, no high-severity flag.');
    expect(v.limits).toBe('On-chain behavior only. Absence of flags is not a clearance of the counterparty.');
  });

  it('says hold on a high-severity flag and names it', () => {
    const v = counterpartyVerdict(
      { band: 'elevated', flags: [flag('high', 'USDC balance held in a dormant wallet', 'Holds 5451 USDC while classified dormant')] },
      activity,
    );
    expect(v.label).toBe('hold');
    expect(v.text).toBe('Hold');
    expect(v.reason).toBe('USDC balance held in a dormant wallet: Holds 5451 USDC while classified dormant.');
  });

  it('says hold when the band is high-signal even without a high flag', () => {
    const v = counterpartyVerdict({ band: 'high-signal', flags: [flag('medium', 'A'), flag('medium', 'B'), flag('medium', 'C')] }, activity);
    expect(v.label).toBe('hold');
    expect(v.reason).toBe('3 medium-severity flags in the last 30 days; the first is A.');
  });

  it('says unknown when there is no activity to judge', () => {
    const v = counterpartyVerdict({ band: 'low-signal', flags: [] }, { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null });
    expect(v.label).toBe('unknown');
    expect(v.text).toBe('Unknown');
    expect(v.reason).toBe('No transfers in the last 30 days on this chain.');
  });

  it('says unknown when the transfer sources could not be read', () => {
    const v = counterpartyVerdict({ band: 'low-signal', flags: [] }, activity, { transfersUnavailable: true });
    expect(v.label).toBe('unknown');
    expect(v.reason).toBe('The on-chain sources this check reads were unavailable, so activity could not be assessed.');
  });
});
