import { describe, expect, it } from 'vitest';
import { RISK_CHECKS } from '@chainward/decode';
import { buildCoverage } from '../lib/reportCoverage';

const reportData = {
  wallet: { type: 'eoa', nonce: 17, code_size: 0, is_virtuals_factory: false },
  activity: {
    latest_transfer_at: '2026-08-30T10:00:00Z',
    latest_transfer_age_hours: 80,
    transfers_24h: 0,
    transfers_7d: 3,
    transfers_30d: 40,
    unique_counterparties_30d: 9,
  },
  fetch_meta: { transfers_fetched: 40, transfers_truncated: false },
  survival: { classification: 'active', rationale: '3 transfers in 7d' },
};

describe('buildCoverage', () => {
  it('lists every catalog check in order, marking the ones this report raised', () => {
    const cov = buildCoverage(reportData, [{ id: 'dormant_wallet' }, { id: 'stranded_value' }]);
    expect(cov).toBeDefined();
    expect(cov!.checks.map((c) => c.id)).toEqual(RISK_CHECKS.map((c) => c.id));
    const raised = cov!.checks.filter((c) => c.raised).map((c) => c.id).sort();
    expect(raised).toEqual(['dormant_wallet', 'stranded_value']);
    expect(cov!.checks.find((c) => c.id === 'dormant_wallet')!.title).toBe('Wallet is dormant');
  });

  it('summarizes the window the check actually looked at', () => {
    const cov = buildCoverage(reportData, [])!;
    expect(cov.window).toEqual({
      transfers_scanned: 40,
      transfers_truncated: false,
      transfers_30d: 40,
      unique_counterparties_30d: 9,
      latest_transfer_at: '2026-08-30T10:00:00Z',
      sent_tx_count: 17,
      wallet_type: 'eoa',
      survival: 'active',
    });
  });

  it('returns undefined rather than inventing numbers when the decode data is missing', () => {
    expect(buildCoverage(null, [])).toBeUndefined();
    expect(buildCoverage({ activity: {} }, [])).toBeUndefined();
  });
});

describe('buildCoverage on BNB Chain', () => {
  const bscData = {
    ...reportData,
    chain: 'bsc',
    fetch_meta: { transfers_fetched: 40, transfers_truncated: false, window_days: 14 },
  };

  it('describes each check against the 14-day window it scanned, never 30 days', () => {
    const cov = buildCoverage(bscData, [])!;
    expect(cov.window.days).toBe(14);
    const text = cov.checks.map((c) => c.looks_for).join('\n');
    expect(text).not.toMatch(/30|roughly/);
    expect(cov.checks.find((c) => c.id === 'counterparty_concentration')!.looks_for).toContain('14 days scanned');
    expect(cov.checks.find((c) => c.id === 'inactive_no_history')!.looks_for).toContain('14-day window');
  });

  it('leaves the Base report wording alone', () => {
    const cov = buildCoverage(reportData, [])!;
    expect(cov.checks.find((c) => c.id === 'counterparty_concentration')!.looks_for).toContain('30 days');
  });
});
