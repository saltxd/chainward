import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RiskReportCard } from '@/lib/api';
import { RecentRow } from '../recently-checked';

// The homepage "Recently filed" list leads each row with the answer (Pay, Hold
// or the third answer), with the top flag as the line under the address. The
// signal band is not shown.

function card(over: Partial<RiskReportCard>): RiskReportCard {
  return {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    band: 'mixed',
    flag_count: 0,
    top_severity: null,
    top_flags: [],
    as_of_date: new Date().toISOString(),
    view_count: 1,
    report_url: '/report/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    ...over,
  };
}

describe('RecentRow', () => {
  it('leads with the verdict, then the top flag title', () => {
    const html = renderToStaticMarkup(
      <RecentRow
        card={card({
          verdict: { label: 'hold', text: 'Hold' },
          band: 'elevated',
          flag_count: 2,
          top_severity: 'medium',
          top_flags: [{ id: 'dormant_wallet', severity: 'medium', title: 'Wallet is dormant' }],
        })}
      />,
    );
    expect(html).toContain('HOLD');
    expect(html).toContain('var(--sev-medium)');
    expect(html).toContain('Wallet is dormant');
    expect(html.indexOf('HOLD')).toBeLessThan(html.indexOf('Wallet is dormant'));
    expect(html).not.toMatch(/elevated|signal/i);
  });

  it('a Pay row with no flags says so plainly, without the band', () => {
    const html = renderToStaticMarkup(<RecentRow card={card({ verdict: { label: 'pay', text: 'Pay' }, band: 'low-signal' })} />);
    expect(html).toContain('PAY');
    expect(html).toContain('var(--seal)');
    expect(html).toContain('no flags raised in the window checked');
    expect(html).not.toMatch(/low signal|low-signal/i);
  });

  it('names the third answer by its case', () => {
    const html = renderToStaticMarkup(<RecentRow card={card({ verdict: { label: 'unknown', text: 'No track record' } })} />);
    expect(html).toContain('NO TRACK RECORD');
  });

  it('does not headline the busy-wallet note as if it were a finding', () => {
    const html = renderToStaticMarkup(
      <RecentRow card={card({ verdict: { label: 'pay', text: 'Pay' }, flag_count: 1, top_severity: 'info', top_flags: [{ id: 'activity_truncated', severity: 'info', title: 'Transfer history truncated at fetch cap' }] })} />,
    );
    expect(html).not.toContain('truncated');
    expect(html).toContain('no flags raised in the window checked');
  });
});

