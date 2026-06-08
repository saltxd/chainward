import { describe, it, expect } from 'vitest';
import { quickDecode, type QuickDecodeInput } from '../src/quick-decode.js';

// Minimal input — exercises only the fetch_meta plumbing; replayMode avoids the claude spawn.
function baseInput(transfers: { items: any[]; truncated?: boolean }): QuickDecodeInput {
  const addr = '0x' + '1'.repeat(40);
  return {
    input: addr,
    wallet_address: addr,
    job_id: 'test',
    pipeline_version: 'test',
    replayMode: true,
    fixtures: {
      acp_details: { data: {} },
      blockscout_counters: { transactions_count: '0', token_transfers_count: '0' },
      blockscout_transfers: transfers,
      sentinel_code: { result: '0x' },
      sentinel_nonce: { result: '0x0' },
      sentinel_eth_balance: { result: '0x0' },
      sentinel_usdc_balance: { result: '0x0' },
    },
  };
}

describe('quickDecode fetch_meta', () => {
  it('reports transfers_fetched + transfers_truncated from the fetch result', async () => {
    const items = [
      { timestamp: new Date().toISOString(), from: { hash: '0xabc' } },
      { timestamp: new Date().toISOString(), from: { hash: '0xdef' } },
    ];
    const res = await quickDecode(baseInput({ items, truncated: true }));
    expect(res.data.fetch_meta).toEqual({ transfers_fetched: 2, transfers_truncated: true });
  });

  it('defaults transfers_truncated to false when the field is absent (legacy fixtures)', async () => {
    const res = await quickDecode(baseInput({ items: [] }));
    expect(res.data.fetch_meta).toEqual({ transfers_fetched: 0, transfers_truncated: false });
  });
});
