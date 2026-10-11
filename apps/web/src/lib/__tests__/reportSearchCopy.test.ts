import { describe, expect, it } from 'vitest';
import { reportSearchCopy } from '../risk';

// What a report page shows in Google and in link previews: the answer first, in
// plain words, for someone about to pay or hire the address.
describe('reportSearchCopy', () => {
  const at = { short: '0xd655…4740', chainName: 'Base' };

  it('leads with Pay and the reason when nothing was found against paying', () => {
    const c = reportSearchCopy({
      ...at,
      flagCount: 0,
      verdict: {
        label: 'pay',
        text: 'Pay',
        reason: 'Active: 242 transfers with 10 counterparties in the last 30 days, last one 46 hours ago, no high-severity flag.',
        limits: 'On-chain behavior only.',
      },
    });
    expect(c.title).toBe('Should you pay 0xd655…4740? Pay: nothing found against it');
    expect(c.description).toBe(
      'Pay. Active: 242 transfers with 10 counterparties in the last 30 days, last one 46 hours ago, no high-severity flag. Free check of 0xd655…4740 on Base before you pay or hire it.',
    );
  });

  it('names the flag behind a Hold in the title', () => {
    const c = reportSearchCopy({
      ...at,
      flagCount: 2,
      verdict: {
        label: 'hold',
        text: 'Hold',
        reason: 'USDC balance held in a dormant wallet: Holds 5451.386272 USDC while closed.',
        limits: '',
      },
    });
    expect(c.title).toBe('Should you pay 0xd655…4740? Hold: USDC balance held in a dormant wallet');
    expect(c.description).toMatch(/^Hold\. USDC balance held in a dormant wallet: Holds 5451\.386272 USDC/);
  });

  it('names the case for the third answer, in the title and the description', () => {
    const c = reportSearchCopy({
      ...at,
      flagCount: 1,
      verdict: { label: 'unknown', text: 'Inactive', reason: "This wallet has sent 43 transactions in its life, but hasn't moved any tokens in the last 30 days.", limits: '' },
    });
    expect(c.title).toBe('Should you pay 0xd655…4740? Inactive: nothing recent to go on');
    expect(c.description).toMatch(/^Inactive\. This wallet has sent 43 transactions/);
  });

  it('falls back to the flag count for reports filed before verdicts, and to a plain prompt with no report', () => {
    expect(reportSearchCopy({ ...at, flagCount: 1 }).title).toBe('Should you pay 0xd655…4740? 1 risk flag found');
    expect(reportSearchCopy({ ...at, flagCount: 0 }).title).toBe('Should you pay 0xd655…4740? No risk flags found');
    expect(reportSearchCopy({ ...at, flagCount: null }).title).toBe('Should you pay 0xd655…4740? Free check');
  });

  it('never uses em dashes or the old jargon', () => {
    for (const flagCount of [null, 0, 3]) {
      const c = reportSearchCopy({ ...at, flagCount });
      expect(`${c.title} ${c.description}`).not.toMatch(/—|low-signal|not a safety verdict/);
    }
  });
});
