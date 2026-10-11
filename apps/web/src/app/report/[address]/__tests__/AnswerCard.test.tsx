import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerCard, FlagList } from '../_components';
import type { PlainAnswer } from '@/lib/plainAnswer';

// The first thing on a report: the decision, big, in its color, with what it
// means, the one reason, how much was checked, and the limit.

const hold: PlainAnswer = {
  label: 'hold',
  word: 'Hold',
  headline: "Don't pay yet. Something here should make you stop.",
  why: "This wallet holds 5,451 USDC but hasn't moved any tokens in the last 30 days.",
  checked: 8,
  raised: 2,
  limit: "On-chain only. We can't see promises made off-chain.",
  checkedAgo: '3 days ago',
  stale: true,
};

describe('AnswerCard', () => {
  it('leads with the decision and its plain meaning, then the reason, the count and the limit', () => {
    const html = renderToStaticMarkup(<AnswerCard answer={hold} onRecheck={() => {}} recheckLoading={false} />);
    expect(html).toContain('rr-answer--hold');
    expect(html).toContain('>Hold<');
    expect(html).toContain('Don&#x27;t pay yet. Something here should make you stop.');
    expect(html).toContain('This wallet holds 5,451 USDC');
    expect(html).toContain('We checked 8 things · 2 came up');
    expect(html).toContain('On-chain only.');
    expect(html.indexOf('>Hold<')).toBeLessThan(html.indexOf('This wallet holds'));
  });

  it('offers a free re-check on an older report, and only says when it was checked on a fresh one', () => {
    const stale = renderToStaticMarkup(<AnswerCard answer={hold} onRecheck={() => {}} recheckLoading={false} />);
    expect(stale).toContain('Checked 3 days ago');
    expect(stale).toContain('Re-check (free)');
    const fresh = renderToStaticMarkup(
      <AnswerCard answer={{ ...hold, stale: false, checkedAgo: 'under an hour ago' }} onRecheck={() => {}} recheckLoading={false} />,
    );
    expect(fresh).toContain('Checked under an hour ago');
    expect(fresh).not.toContain('Re-check (free)');
  });

  it('says "1 came up" and "nothing came up" naturally', () => {
    expect(renderToStaticMarkup(<AnswerCard answer={{ ...hold, raised: 1 }} onRecheck={() => {}} recheckLoading={false} />)).toContain(
      'We checked 8 things · 1 came up',
    );
    expect(
      renderToStaticMarkup(<AnswerCard answer={{ ...hold, label: 'pay', word: 'Pay', raised: 0 }} onRecheck={() => {}} recheckLoading={false} />),
    ).toContain('We checked 8 things · nothing came up');
  });
});

describe('FlagList, readable', () => {
  const src = 'https://base.blockscout.com/address/0xabc';
  it('tidies numbers, links the transfers, and says the page cap in plain words', () => {
    const html = renderToStaticMarkup(
      <FlagList
        flags={[
          { id: 'stranded_value', severity: 'high', title: 'USDC balance held in a dormant wallet', evidence: 'Holds 5451.386272 USDC while classified dormant.', source: src },
          {
            id: 'activity_truncated',
            severity: 'info',
            title: 'Transfer history truncated at fetch cap',
            evidence: 'Fetched 2000 transfers and hit the page cap; activity counts are a lower bound, not a lifetime total.',
            source: src,
          },
        ]}
      />,
    );
    expect(html).toContain('Holds 5,451.39 USDC');
    expect(html).toContain('href="https://base.blockscout.com/address/0xabc?tab=token_transfers"');
    expect(html).toContain('See the transfers on base.blockscout.com');
    expect(html).toContain('Busy wallet: we read its newest 2,000 transfers');
    expect(html).not.toContain('fetch cap');
  });
});

describe('CheckProgress', () => {
  it('shows the steps done, the one running, and the ones to come, with the time so far', async () => {
    const { CheckProgress } = await import('../_components');
    const html = renderToStaticMarkup(<CheckProgress startedAt={Date.now() - 9_000} />);
    expect(html).toContain('Looking up the wallet');
    expect(html).toContain('rr-progress-step--done');
    expect(html).toContain('rr-progress-step--now');
    expect(html).toContain('rr-progress-step--next');
    expect(html).toMatch(/9s|10s/);
  });
});
