import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoverageBlock } from '../_components';
import { zeroFlagsCopy, ZERO_FLAGS_COPY } from '@/lib/risk';
import type { RiskCoverage } from '@/lib/api';

const coverage: RiskCoverage = {
  checks: [
    { id: 'dormant_wallet', title: 'Wallet is dormant', looks_for: 'No transfers in the 7-day window', raised: true },
    { id: 'stranded_value', title: 'USDC balance held in a dormant wallet', looks_for: 'USDC parked in a dormant wallet', raised: false },
    { id: 'factory_proxy_clone', title: 'Virtuals factory proxy clone', looks_for: 'Factory minimal-proxy bytecode', raised: false },
  ],
  window: {
    transfers_scanned: 40,
    transfers_truncated: false,
    transfers_30d: 40,
    unique_counterparties_30d: 9,
    latest_transfer_at: '2026-08-30T10:00:00Z',
    sent_tx_count: 17,
    wallet_type: 'eoa',
    survival: 'active',
  },
};

describe('CoverageBlock', () => {
  it('states how many checks ran and how many were raised, never a pass/fail verdict', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={coverage} />);
    expect(html).toContain('3 checks run');
    expect(html).toContain('1 raised');
    expect(html).toContain('2 not raised');
    expect(html).not.toMatch(/\b(passed|safe|clear)\b/i);
  });

  it('lists every check by title with the raised ones marked', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={coverage} />);
    for (const c of coverage.checks) expect(html).toContain(c.title);
    expect(html.match(/rr-check--raised/g)?.length).toBe(1);
    expect(html.match(/rr-check--quiet/g)?.length).toBe(2);
  });

  it('shows the window it looked at', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={coverage} />);
    expect(html).toContain('40');
    expect(html).toContain('transfers scanned');
    expect(html).toContain('counterparties');
  });

  it('renders nothing when the API did not provide coverage', () => {
    expect(renderToStaticMarkup(<CoverageBlock coverage={undefined} />)).toBe('');
  });
});

describe('zeroFlagsCopy', () => {
  it('turns a quiet result into a statement of what was examined', () => {
    expect(zeroFlagsCopy(coverage)).toBe(
      'No flags raised across 40 transfers and 9 counterparties in the 30-day window checked, against 3 checks.',
    );
  });

  it('falls back to the generic copy without coverage', () => {
    expect(zeroFlagsCopy(undefined)).toBe(ZERO_FLAGS_COPY);
  });

  it('says so when the scan hit the fetch cap', () => {
    expect(
      zeroFlagsCopy({ ...coverage, window: { ...coverage.window, transfers_truncated: true } }),
    ).toContain('at least 40 transfers');
  });
});

describe('CoverageBlock when the transfer list could not be read', () => {
  const REASON =
    'Every transfer source failed: public Base RPC logs (eth_getLogs: 400); Blockscout (blockscout transfers: 403).';
  const unread: RiskCoverage = {
    checks: [
      { ...coverage.checks[0]!, raised: false, status: 'not_assessed', reason: REASON },
      { ...coverage.checks[1]!, raised: false, status: 'not_assessed', reason: REASON },
      { ...coverage.checks[2]!, raised: false, status: 'not_raised' },
    ],
    window: {
      ...coverage.window,
      transfers_unavailable: REASON,
      transfers_scanned: 0,
      transfers_30d: 0,
      unique_counterparties_30d: 0,
      latest_transfer_at: null,
      survival: 'unknown',
    },
  };

  it('marks the checks that need the transfer list not assessed, never "not raised", and says why', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={unread} />);
    expect(html).toContain('1 checks run');
    expect(html).toContain('1 not raised');
    expect(html).toContain('2 not assessed');
    expect(html.match(/rr-check--na/g)?.length).toBe(2);
    expect(html.match(/rr-check--quiet/g)?.length).toBe(1);
    expect(html).toContain('Blockscout (blockscout transfers: 403)');
  });

  it('does not print zeros for transfer figures it never read', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={unread} />);
    expect(html).not.toContain('none in window');
    expect(html).not.toMatch(/rr-stat-value mono">0</);
    // The nonce comes from an RPC read that did succeed, so txs.sent still shows.
    expect(html).toContain('rr-stat-value mono">17<');
  });

  it('names a failed balance read in the window notice and the quiet copy, never "across N transfers" as a clean result', () => {
    const degraded = {
      ...coverage,
      checks: coverage.checks.map((c) =>
        c.id === 'stranded_value' ? { ...c, raised: false, status: 'not_assessed' as const, reason: 'The USDC balance could not be read.' } : c,
      ),
      window: { ...coverage.window, state_unavailable: ['usdc_balance'] },
    };
    const html = renderToStaticMarkup(<CoverageBlock coverage={degraded} />);
    expect(html).toContain('1 not assessed');
    expect(html).toContain('USDC balance could not be read');
    expect(zeroFlagsCopy(degraded)).toMatch(/USDC balance could not be read/);
  });

  it('never words a failed read as a quiet result', () => {
    const copy = zeroFlagsCopy(unread);
    expect(copy).not.toMatch(/across 0 transfers/);
    expect(copy).toMatch(/transfer list could not be read/);
  });
});

describe('CoverageBlock window days', () => {
  it('labels the window with the days actually scanned when the report says so', () => {
    const bsc: RiskCoverage = { ...coverage, window: { ...coverage.window, days: 14 } };
    const html = renderToStaticMarkup(<CoverageBlock coverage={bsc} />);
    expect(html).toContain('in the 14-day window');
    expect(html).toContain('transfers.window');
    expect(html).not.toContain('30-day');
    expect(zeroFlagsCopy(bsc)).toContain('14-day window');
    const partial: RiskCoverage = { ...coverage, window: { ...coverage.window, days: 4.63 } };
    expect(renderToStaticMarkup(<CoverageBlock coverage={partial} />)).toContain('in the 4.6-day window');
    const hours: RiskCoverage = { ...coverage, window: { ...coverage.window, days: 0.1 } };
    expect(renderToStaticMarkup(<CoverageBlock coverage={hours} />)).toContain('in the 2-hour window');
  });

  it('defaults to the 30-day label for reports without a recorded window', () => {
    const html = renderToStaticMarkup(<CoverageBlock coverage={coverage} />);
    expect(html).toContain('in the 30-day window');
  });
});
