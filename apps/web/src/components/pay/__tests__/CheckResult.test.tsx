import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckResult } from '../CheckResult';
import { COUNTERPARTY, HIRES, NO_HISTORY, SELLER } from './fixtures';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('CheckResult: seller check', () => {
  const html = renderToStaticMarkup(<CheckResult kind="seller" data={SELLER} />);

  it('opens with the verdict, its reason and its limit, before any signal', () => {
    const v = { label: 'self_funded_demand', text: 'Self-funded demand', reason: '29 of 30 top buyers checked trace back.', limits: 'Walk stops at exchanges.' };
    const html = renderToStaticMarkup(<CheckResult kind="seller" data={{ ...SELLER, verdict: v }} />);
    expect(html).toContain('pay-verdict--self_funded_demand');
    expect(html.indexOf('Self-funded demand')).toBeLessThan(html.indexOf('One wallet funds most checked buyers'));
    expect(html).toContain('29 of 30 top buyers checked trace back.');
    expect(html).toContain('Walk stops at exchanges.');
  });

  it('lists every signal with its evidence', () => {
    for (const s of SELLER.signals) {
      expect(text(html)).toContain(s.title);
      expect(text(html)).toContain(s.evidence);
    }
  });

  it('says how many top buyers were checked and how many trace back', () => {
    expect(text(html)).toContain('30 of 30 top buyers checked trace back to the seller');
  });

  it('names the payers behind facilitator proxies', () => {
    expect(text(html)).toContain('payers behind Meridian: 5, all funded by the seller');
  });

  it('keeps the disclaimer and says so when no signal was raised', () => {
    expect(text(html)).toContain(SELLER.disclaimer);
    const quiet = renderToStaticMarkup(<CheckResult kind="seller" data={{ ...SELLER, signals: [], proxied_payers: [] }} />);
    expect(text(quiet)).toContain('No signals raised.');
  });
});

describe('CheckResult: hire check', () => {
  it('opens the hire result with the verdict', () => {
    const v = { label: 'hired_by_others', text: 'Hired by others', reason: '7 of 7 hirers show no link.', limits: 'Not proven independence.' };
    const html = renderToStaticMarkup(<CheckResult kind="hires" data={{ ...HIRES, verdict: v }} />);
    expect(html).toContain('pay-verdict--hired_by_others');
    expect(html.indexOf('Hired by others')).toBeLessThan(html.indexOf('distinct hirers'));
  });

  const html = renderToStaticMarkup(<CheckResult kind="hires" data={HIRES} />);

  it('shows every hirer with its verdict and evidence', () => {
    expect(html).toContain('href="https://bscscan.com/address/0x4e276b4db12447254134b45e5add170993df5ad2"');
    expect(text(html)).toContain('inconclusive');
    expect(text(html)).toContain('shares a funder with the owner');
    expect(text(html)).toContain(HIRES.hirers[1]!.evidence);
  });

  it('says whether three independent hirers were found', () => {
    expect(text(html)).toContain('3 hires from 2 distinct hirers');
    expect(text(html)).toContain('Fewer than 3 independent hirers');
    const passing = renderToStaticMarkup(
      <CheckResult kind="hires" data={{ ...HIRES, summary: { ...HIRES.summary, passes_three_independent: true } }} />,
    );
    expect(text(passing)).toContain('3 or more independent hirers');
  });
});

describe('CheckResult: counterparty check', () => {
  it('opens the counterparty result with Pay / Hold / Unknown', () => {
    const v = { label: 'hold', text: 'Hold', reason: 'Stranded value: holds 5,451 USDC while dormant.', limits: 'On-chain behavior only.' };
    const html = renderToStaticMarkup(
      <CheckResult kind="counterparty" data={{ ...COUNTERPARTY, report: { ...COUNTERPARTY.report, verdict: v } }} />,
    );
    expect(html).toContain('pay-verdict--hold');
    expect(html.indexOf('Hold')).toBeLessThan(html.indexOf('Band'));
  });

  it('shows Unknown on a no-history result that carries a verdict', () => {
    const v = { label: 'unknown', text: 'Unknown', reason: 'No transfers in the last 30 days on this chain.', limits: 'On-chain behavior only.' };
    const html = renderToStaticMarkup(<CheckResult kind="counterparty" data={{ ...NO_HISTORY, verdict: v }} />);
    expect(html).toContain('pay-verdict--unknown');
  });

  it('shows the band and each flag with its source', () => {
    const html = renderToStaticMarkup(<CheckResult kind="counterparty" data={COUNTERPARTY} />);
    expect(text(html)).toContain('high signal');
    expect(text(html)).toContain('USDC balance held in a dormant wallet');
    expect(text(html)).toContain('Holds 5451.386272 USDC while classified dormant');
    expect(html).toContain('href="https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2"');
    expect(html).toContain('href="/report/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2"');
    expect(text(html)).toContain(COUNTERPARTY.report.disclaimer);
  });

  it('says when an address has no history', () => {
    const html = renderToStaticMarkup(<CheckResult kind="counterparty" data={NO_HISTORY} />);
    expect(text(html)).toContain('No on-chain history');
  });

  it('never reads as a clearance when no flag surfaced', () => {
    const html = renderToStaticMarkup(
      <CheckResult kind="counterparty" data={{ ...COUNTERPARTY, report: { ...COUNTERPARTY.report, band: 'low-signal', flags: [] } }} />,
    );
    expect(text(html)).toContain('No flags surfaced in the window checked. Not a safety verdict.');
  });
});

describe('CheckResult: anything else', () => {
  it('falls back to the raw JSON rather than failing', () => {
    const html = renderToStaticMarkup(<CheckResult kind="seller" data={{ unexpected: true }} />);
    expect(text(html)).toContain('"unexpected": true');
  });

  it('uses no verdict words', () => {
    const all = [
      renderToStaticMarkup(<CheckResult kind="seller" data={SELLER} />),
      renderToStaticMarkup(<CheckResult kind="hires" data={HIRES} />),
      renderToStaticMarkup(<CheckResult kind="counterparty" data={COUNTERPARTY} />),
    ].join(' ');
    expect(text(all)).not.toMatch(/\b(safe|scam|fraud|fake)\b/i);
  });
});
