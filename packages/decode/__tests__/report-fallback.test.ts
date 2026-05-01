import { describe, it, expect } from 'vitest';
import { renderFallbackReport } from '../src/templates/report-fallback.md.js';
import type { QuickDecodeResultData } from '../src/types.js';

const sampleData: QuickDecodeResultData = {
  target: {
    input: '@axelrod',
    wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
    handle: 'AIxVC_Axelrod',
    name: 'Axelrod',
    acp_id: 129,
    virtuals_agent_id: null,
    framework: 'virtuals_acp',
    owner_address: null,
  },
  wallet: { type: 'erc1967_proxy', nonce: 1, code_size: 234, is_virtuals_factory: true },
  balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 6.42, usd: 6.42 }, agent_token: null },
  token_trading: null,
  activity: {
    latest_transfer_at: '2026-04-30T00:00:00Z',
    latest_transfer_age_hours: 1.2,
    transfers_24h: 36,
    transfers_7d: 42,
    transfers_30d: 182,
    unique_counterparties_30d: 12,
  },
  claims: {
    agdp: 106928592.89, revenue: null, successful_jobs: null, total_jobs: null,
    success_rate: 94.84, last_active_at_acp: null, is_online_acp: true,
  },
  chain_reality: {
    active_today: true, active_7d: true, active_30d: true,
    settlement_path: ['payment_manager_in'], payment_manager_seen: true,
  },
  discrepancies: [],
  checks_performed: ['lastActiveAt', 'isOnline'],
  survival: { classification: 'active', rationale: '42 transfers in last 7d' },
  usdc_pattern: 'running',
  peers: { similar_active: ['Otto AI', 'Nox'], similar_dormant: [], cluster: null, cluster_status: null },
};

describe('renderFallbackReport', () => {
  it('produces a markdown report starting with H1 in the locked format', () => {
    const md = renderFallbackReport(sampleData);
    expect(md).toMatch(/^# Axelrod \(ACP #129\) — active/m);
  });
  it('contains the survival classification and rationale', () => {
    const md = renderFallbackReport(sampleData);
    expect(md).toContain('active');
    expect(md).toContain('42 transfers');
  });
  it('does NOT include numeric "survival score"', () => {
    const md = renderFallbackReport(sampleData);
    expect(md.toLowerCase()).not.toMatch(/survival score:?\s*\d/);
  });
  it('handles dormant + graveyard usdc_pattern with the stranded-value framing', () => {
    const dormant = { ...sampleData,
      survival: { classification: 'dormant' as const, rationale: 'no transfers in 19 days' },
      usdc_pattern: 'graveyard' as const,
      balances: { ...sampleData.balances, usdc: { amount: 3658, usd: 3658 } },
    };
    const md = renderFallbackReport(dormant);
    expect(md.toLowerCase()).toContain('stranded');
  });
});
