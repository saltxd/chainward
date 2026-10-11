import { describe, expect, it } from 'vitest';
import type { RiskReport } from '../api';
import { ago, plainAnswer, tidyNumbers, transferHistoryUrl } from '../plainAnswer';

// The answer a person sees first after pasting an address: the decision, what it
// means in plain words, the one reason with readable numbers, and the limit.

const NOW = new Date('2026-10-11T18:00:00Z');

function report(over: Partial<RiskReport> & { window?: Partial<NonNullable<RiskReport['coverage']>['window']> }): RiskReport {
  const { window, ...rest } = over;
  return {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    band: 'low-signal',
    flags: [],
    not_assessed: [],
    freshness: { as_of_block: 1, generated_at: '2026-10-08T18:00:00Z', ttl_state: 'stale' },
    coverage: {
      checks: [
        { id: 'a', title: 'A', looks_for: '', raised: false, status: 'not_raised' },
        { id: 'b', title: 'B', looks_for: '', raised: true, status: 'raised' },
        { id: 'c', title: 'C', looks_for: '', raised: false, status: 'not_raised' },
      ],
      window: {
        transfers_scanned: 2000,
        transfers_truncated: true,
        transfers_30d: 2000,
        unique_counterparties_30d: 37,
        latest_transfer_at: '2026-10-11T17:31:05Z',
        sent_tx_count: 117,
        wallet_type: 'eoa',
        survival: 'active',
        ...window,
      },
    },
    classifier_version: '1',
    view_count: 0,
    disclaimer: '',
    ...rest,
  } as RiskReport;
}

describe('plainAnswer', () => {
  it('Pay: says nothing argues against paying, with the activity behind it', () => {
    const a = plainAnswer(
      report({ verdict: { label: 'pay', text: 'Pay', reason: 'Active: 2000 transfers…', limits: 'x' } }),
      NOW,
    );
    expect(a!.word).toBe('Pay');
    expect(a!.headline).toBe("Nothing we can see says don't.");
    expect(a!.why).toBe('2,000+ transfers with 37 different wallets in the last 30 days, the last one under an hour ago.');
    expect(a!.checked).toBe(3);
    expect(a!.raised).toBe(1);
    expect(a!.limit).toMatch(/not a guarantee/);
  });

  it('Hold on stranded USDC: names the amount, readable, and the silence', () => {
    const a = plainAnswer(
      report({
        band: 'high-signal',
        verdict: { label: 'hold', text: 'Hold', reason: 'USDC balance held in a dormant wallet: …', limits: 'x' },
        flags: [
          { id: 'dormant_wallet', severity: 'medium', title: 'Wallet is dormant', evidence: 'no transfers in the last 30 days', source: '' },
          {
            id: 'stranded_value',
            severity: 'high',
            title: 'USDC balance held in a dormant wallet',
            evidence: 'Holds 5451.386272 USDC while classified dormant (no transfers in the last 30 days; holds a balance from before the window).',
            source: '',
          },
        ],
        window: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null },
      }),
      NOW,
    );
    expect(a!.word).toBe('Hold');
    expect(a!.headline).toBe("Don't pay yet. Something here should make you stop.");
    expect(a!.why).toBe("This wallet holds 5,451 USDC but hasn't moved any tokens in the last 30 days.");
  });

  it('Hold on concentration and on a dormant wallet, in plain words', () => {
    const conc = plainAnswer(
      report({
        verdict: { label: 'hold', text: 'Hold', reason: 'x', limits: 'x' },
        flags: [{ id: 'counterparty_concentration', severity: 'medium', title: 't', evidence: 'e', source: '' }],
        window: { transfers_30d: 41, unique_counterparties_30d: 2 },
      }),
      NOW,
    );
    expect(conc!.why).toBe('Its 41 transfers in the last 30 days all went to or from just 2 wallets.');
    const dormant = plainAnswer(
      report({
        verdict: { label: 'hold', text: 'Hold', reason: 'x', limits: 'x' },
        flags: [{ id: 'dormant_wallet', severity: 'medium', title: 't', evidence: 'e', source: '' }],
      }),
      NOW,
    );
    expect(dormant!.why).toBe("This wallet hasn't moved any tokens in the last 30 days.");
  });

  it('the third answer says which case it is: Inactive, No track record, or Couldn\'t check', () => {
    const quiet = plainAnswer(
      report({ verdict: { label: 'unknown', text: 'Unknown', reason: 'No transfers in the last 30 days on this chain.', limits: 'x' }, window: { transfers_30d: 0, sent_tx_count: 43 } }),
      NOW,
    );
    expect(quiet!.word).toBe('Inactive');
    expect(quiet!.headline).toBe('Nothing recent to go on.');
    expect(quiet!.why).toBe("This wallet has sent 43 transactions in its life, but hasn't moved any tokens in the last 30 days.");
    expect(quiet!.advice).toBe("If it's meant to be a working agent, ask why before you pay, or start small.");
    const fresh = plainAnswer(
      report({ verdict: { label: 'unknown', text: 'Unknown', reason: 'x', limits: 'x' }, window: { transfers_30d: 0, sent_tx_count: 0 } }),
      NOW,
    );
    expect(fresh!.word).toBe('No track record');
    expect(fresh!.headline).toBe('Brand new: no history yet.');
    expect(fresh!.advice).toBe('Treat it like a stranger: start small.');
    const down = plainAnswer(
      report({ verdict: { label: 'unknown', text: 'Unknown', reason: 'x', limits: 'x' }, window: { transfers_unavailable: 'all sources failed' } }),
      NOW,
    );
    expect(down!.word).toBe("Couldn't check");
    expect(down!.headline).toBe("We couldn't read the chain just now.");
    expect(down!.advice).toBe('Re-check in a minute.');
  });

  it('Hold on the US sanctions list: says so plainly, even next to another high flag and with no activity', () => {
    const ofac = {
      id: 'ofac_sanctioned',
      severity: 'high' as const,
      title: 'On the US sanctions list (OFAC)',
      evidence: 'This address is on the US Treasury OFAC SDN list. Paying it may be illegal for US persons.',
      source: 'https://sanctionssearch.ofac.treas.gov/',
    };
    const stranded = { id: 'stranded_value', severity: 'high' as const, title: 'USDC balance held in a dormant wallet', evidence: 'Holds 12 USDC', source: '' };
    const a = plainAnswer(
      report({
        band: 'high-signal',
        verdict: { label: 'hold', text: 'Hold', reason: 'On the US sanctions list (OFAC): …', limits: 'x' },
        flags: [stranded, ofac],
        window: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null, transfers_unavailable: 'every source failed' },
      }),
      NOW,
    );
    expect(a!.word).toBe('Hold');
    expect(a!.why).toBe('This address is on the US Treasury sanctions list. Paying it may be illegal for US persons.');
  });

  it('falls back to the server reason for an unmapped Hold flag', () => {
    const odd = plainAnswer(
      report({ verdict: { label: 'hold', text: 'Hold', reason: 'Something new: 12 events.', limits: 'x' }, flags: [{ id: 'brand_new_check', severity: 'high', title: 't', evidence: 'e', source: '' }] }),
      NOW,
    );
    expect(odd!.why).toBe('Something new: 12 events.');
  });

  it('reports filed before verdicts have no answer card', () => {
    expect(plainAnswer(report({}), NOW)).toBeNull();
  });

  it('never says safe', () => {
    for (const label of ['pay', 'hold', 'unknown']) {
      const a = plainAnswer(report({ verdict: { label, text: label, reason: 'r', limits: 'l' } }), NOW)!;
      expect(`${a.headline} ${a.why} ${a.limit}`.toLowerCase()).not.toMatch(/\bsafe\b/);
    }
  });
});

describe('helpers', () => {
  it('ago: minutes, hours, days', () => {
    expect(ago('2026-10-11T17:31:05Z', NOW)).toBe('under an hour ago');
    expect(ago('2026-10-11T15:00:00Z', NOW)).toBe('3 hours ago');
    expect(ago('2026-10-10T17:00:00Z', NOW)).toBe('1 day ago');
    expect(ago('2026-10-08T18:00:00Z', NOW)).toBe('3 days ago');
  });

  it('tidyNumbers: long decimals and big integers become readable', () => {
    expect(tidyNumbers('Holds 5451.386272 USDC while dormant')).toBe('Holds 5,451.39 USDC while dormant');
    expect(tidyNumbers('Fetched 2000 transfers')).toBe('Fetched 2,000 transfers');
    expect(tidyNumbers('block 52475292 and 0x47d3394c7234714e4b9e')).toBe('block 52,475,292 and 0x47d3394c7234714e4b9e');
    expect(tidyNumbers('in the last 30 days')).toBe('in the last 30 days');
  });

  it('transferHistoryUrl: points the explorer at the transfers, on Base and BNB Chain', () => {
    expect(transferHistoryUrl('https://base.blockscout.com/address/0xabc')).toBe('https://base.blockscout.com/address/0xabc?tab=token_transfers');
    expect(transferHistoryUrl('https://bscscan.com/address/0xabc')).toBe('https://bscscan.com/address/0xabc#tokentxns');
    expect(transferHistoryUrl('https://app.virtuals.io/acp')).toBe('https://app.virtuals.io/acp');
  });
});
