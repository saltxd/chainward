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
