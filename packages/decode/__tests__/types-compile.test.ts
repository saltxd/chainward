import { describe, it, expect } from 'vitest';
import type { QuickDecodeResult } from '../src/index.js';
import { DISCLOSURE_TEXT } from '../src/index.js';

describe('QuickDecodeResult type shape', () => {
  it('compiles a complete object literal', () => {
    const sample: QuickDecodeResult = {
      report: '# Sample\n\nBody.',
      data: {
        target: {
          input: '@axelrod',
          wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
          handle: 'AIxVC_Axelrod',
          name: 'Axelrod',
          acp_id: 129,
          virtuals_agent_id: null,
          framework: 'virtuals_acp',
          owner_address: '0xaa3189f41127a41e840caf2c1d467eb8ccf197d8',
        },
        wallet: { type: 'erc1967_proxy', nonce: 1, code_size: 234, is_virtuals_factory: true },
        balances: {
          eth: { wei: '0', usd: 0 },
          usdc: { amount: 6.42, usd: 6.42 },
          agent_token: null,
        },
        token_trading: null,
        activity: {
          latest_transfer_at: '2026-04-30T00:00:00Z',
          latest_transfer_age_hours: 0.5,
          transfers_24h: 36,
          transfers_7d: 42,
          transfers_30d: 182,
          unique_counterparties_30d: 12,
        },
        claims: {
          agdp: 106928592.89,
          revenue: null,
          successful_jobs: null,
          total_jobs: null,
          success_rate: 94.84,
          last_active_at_acp: null,
          is_online_acp: true,
        },
        chain_reality: {
          active_today: true,
          active_7d: true,
          active_30d: true,
          settlement_path: ['payment_manager_in', 'settlement_contract_out'],
          payment_manager_seen: true,
        },
        discrepancies: [],
        checks_performed: ['lastActiveAt', 'isOnline'],
        survival: { classification: 'active', rationale: 'recent activity, peer cohort intact' },
        usdc_pattern: 'running',
        peers: {
          similar_active: ['Otto AI', 'Nox'],
          similar_dormant: [],
          cluster: null,
          cluster_status: null,
        },
      },
      sources: [
        {
          label: 'Sentinel eth_call USDC.balanceOf',
          url: 'rpc://cw-sentinel:8545',
          block_number: 44545679,
          block_hash: '0x9954b825e40a5fc0dac606b764924a27527843fc176cf8c8d2deb341945a1b8c',
          timestamp: '2026-04-30T00:00:00Z',
        },
      ],
      meta: {
        schema_version: '1.0.0',
        classifier_version: '1.0.0',
        tier: 'quick',
        pipeline_version: 'abcd1234',
        generated_at: '2026-04-30T00:00:00Z',
        as_of_block: { number: 44545679, hash: '0x9954b825e40a5fc0dac606b764924a27527843fc176cf8c8d2deb341945a1b8c' },
        target_input: '@axelrod',
        job_id: 'job-1',
        disclosure: DISCLOSURE_TEXT,
      },
    };
    expect(sample.meta.tier).toBe('quick');
  });
});
