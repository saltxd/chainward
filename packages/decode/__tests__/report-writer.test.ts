import { describe, it, expect } from 'vitest';
import { writeReport, PROMPT_VERSION } from '../src/report-writer.js';
import type { QuickDecodeResultData } from '../src/types.js';

const minimalData = {
  target: { input: '@x', wallet_address: '0xabc', handle: null, name: 'Axelrod', acp_id: 129, virtuals_agent_id: null, framework: 'virtuals_acp' as const, owner_address: null },
  wallet: { type: 'erc1967_proxy' as const, nonce: 1, code_size: 100, is_virtuals_factory: true },
  balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 6, usd: 6 }, agent_token: null },
  token_trading: null,
  activity: { latest_transfer_at: '2026-04-30T00:00:00Z', latest_transfer_age_hours: 1, transfers_24h: 36, transfers_7d: 42, transfers_30d: 182, unique_counterparties_30d: 12 },
  claims: { agdp: 1, revenue: null, successful_jobs: null, total_jobs: null, success_rate: null, last_active_at_acp: null, is_online_acp: true },
  chain_reality: { active_today: true, active_7d: true, active_30d: true, settlement_path: [], payment_manager_seen: true },
  discrepancies: [],
  checks_performed: [],
  survival: { classification: 'active' as const, rationale: 'recent activity' },
  usdc_pattern: 'running' as const,
  peers: { similar_active: [], similar_dormant: [], cluster: null, cluster_status: null },
} satisfies QuickDecodeResultData;

describe('writeReport (replayMode)', () => {
  it('uses fallback template when replayMode: true (no claude call)', async () => {
    const result = await writeReport(minimalData, { replayMode: true });
    expect(result.markdown).toMatch(/^# Axelrod \(ACP #129\) — active/m);
    expect(result.source).toBe('fallback');
  });
  it('exports a PROMPT_VERSION constant', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
