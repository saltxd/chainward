import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RiskReportCard } from '@/lib/api';
import { RegisterTable } from '../register-table';

// /reports lists every address on file with the answer first: Pay, Hold or the
// third answer, then the top flag. The signal band stays out of the list.

function card(over: Partial<RiskReportCard>): RiskReportCard {
  return {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    band: 'mixed',
    flag_count: 0,
    top_severity: null,
    top_flags: [],
    as_of_date: '2026-10-10T12:00:00.000Z',
    view_count: 4,
    report_url: '/report/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    ...over,
  };
}

describe('RegisterTable', () => {
  it('opens each row with the verdict, then the top flag', () => {
    const html = renderToStaticMarkup(
      <RegisterTable
        reports={[
          card({
            verdict: { label: 'hold', text: 'Hold' },
            band: 'high-signal',
            flag_count: 2,
            top_severity: 'high',
            top_flags: [{ id: 'stranded_value', severity: 'high', title: 'USDC balance held in a dormant wallet' }],
          }),
        ]}
      />,
    );
    expect(html).toContain('HOLD');
    expect(html).toContain('var(--sev-medium)');
    expect(html).toContain('USDC balance held in a dormant wallet');
    expect(html.indexOf('HOLD')).toBeLessThan(html.indexOf('USDC balance held'));
  });

  it('says Pay with no flags in plain words, and never shows the band', () => {
    const html = renderToStaticMarkup(
      <RegisterTable reports={[card({ verdict: { label: 'pay', text: 'Pay' }, band: 'low-signal' }), card({ band: 'elevated', address: '0x1111111111111111111111111111111111111111' })]} />,
    );
    expect(html).toContain('PAY');
    expect(html).toContain('var(--seal)');
    expect(html).toContain('Nothing flagged in the window checked');
    expect(html).not.toMatch(/low signal|mixed signal|elevated signal|high signal|low-signal|elevated/i);
  });

  it('names the third answer by its case', () => {
    const html = renderToStaticMarkup(<RegisterTable reports={[card({ verdict: { label: 'unknown', text: 'Inactive' } })]} />);
    expect(html).toContain('INACTIVE');
    expect(html).toContain('var(--ink-soft)');
  });

  it('marks only the noindexed (third answer) rows nofollow', () => {
    const pay = renderToStaticMarkup(<RegisterTable reports={[card({ verdict: { label: 'pay', text: 'Pay' }, band: 'low-signal' })]} />);
    expect(pay).not.toContain('nofollow');
    const quiet = renderToStaticMarkup(<RegisterTable reports={[card({ verdict: { label: 'unknown', text: 'No track record' }, flag_count: 1 })]} />);
    expect(quiet).toContain('rel="nofollow"');
  });
});
