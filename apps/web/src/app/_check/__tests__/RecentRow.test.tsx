import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RiskReportCard } from '@/lib/api';
import { RecentRow, freshCards } from '../recently-checked';

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
    expect(html).toContain('Has gone quiet: no token moves in over a week');
    expect(html).not.toContain('Wallet is dormant');
    expect(html.indexOf('HOLD')).toBeLessThan(html.indexOf('Has gone quiet'));
    expect(html).not.toMatch(/elevated|signal/i);
  });

  it('says why a dormant wallet holding USDC is a Hold, in plain words', () => {
    const html = renderToStaticMarkup(
      <RecentRow
        card={card({
          verdict: { label: 'hold', text: 'Hold' },
          flag_count: 2,
          top_severity: 'high',
          top_flags: [{ id: 'stranded_value', severity: 'high', title: 'USDC balance held in a dormant wallet' }],
        })}
      />,
    );
    expect(html).toContain('Holds USDC but has gone quiet: money sent here may sit unclaimed');
    expect(html).not.toContain('USDC balance held in a dormant wallet');
  });

  it('keeps a flag it has no plain words for as the engine titled it', () => {
    const html = renderToStaticMarkup(
      <RecentRow card={card({ verdict: { label: 'unknown', text: 'Payer hidden' }, flag_count: 1, top_severity: 'info', top_flags: [{ id: 'privacy_relay', severity: 'info', title: 'Pays for others through a privacy pool (px402)' }] })} />,
    );
    expect(html).toContain('Pays for others through a privacy pool (px402)');
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

describe('freshCards', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it('keeps only checks from the last 14 days, newest list order kept', () => {
    const cards = [card({ address: '0x1', as_of_date: at(1) }), card({ address: '0x2', as_of_date: at(13.9) }), card({ address: '0x3', as_of_date: at(15) })];
    expect(freshCards(cards, now).map((c) => c.address)).toEqual(['0x1', '0x2']);
  });

  it('returns nothing when every check is older, so the section can hide', () => {
    expect(freshCards([card({ as_of_date: at(30) })], now)).toEqual([]);
  });
});
