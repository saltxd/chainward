import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseTimeOfBlock } from '@chainward/common';
import { DEMAND_WINDOW_DAYS } from '@chainward/decode';

// The weekly x402 board: its seller checks must look back DEMAND_WINDOW_DAYS of
// real time on Base, whatever the block time is. No network, fake Redis.
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const redis = vi.hoisted(() => ({ set: vi.fn(async () => 'OK') }));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('bullmq', () => ({ Queue: vi.fn(), Worker: vi.fn() }));

import { buildX402Board } from '../x402Board.js';

const HEAD = 60_000_000;
const SELLER = '0x68396bd35874695ad86cd29410bd80a550991a2b';

describe('buildX402Board window', () => {
  const fromBlocks: string[] = [];

  beforeEach(() => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test-key');
    fromBlocks.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        if (String(url).startsWith('https://www.x402scan.com/')) {
          if (String(url).includes('sellers.all.list')) {
            const items = [{ recipient: SELLER, tx_count: 1, total_amount: 1e6, unique_buyers: 1, facilitator_ids: [], latest_block_timestamp: '' }];
            return new Response(JSON.stringify({ result: { data: { json: { items } } } }));
          }
          return new Response(JSON.stringify({ result: { data: { json: { items: [], hasNextPage: false } } } }));
        }
        const req = JSON.parse(init?.body ?? '{}') as { method: string; params: Array<{ fromBlock?: string }> };
        if (req.method === 'alchemy_getAssetTransfers') fromBlocks.push(req.params[0]?.fromBlock ?? '');
        const result = req.method === 'eth_blockNumber' ? `0x${HEAD.toString(16)}` : { transfers: [] };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('starts at the block that is truly DEMAND_WINDOW_DAYS back', async () => {
    await buildX402Board();
    expect(fromBlocks.length).toBeGreaterThan(0);
    const from = Number(BigInt(fromBlocks[0]!));
    const span = baseTimeOfBlock(HEAD) - baseTimeOfBlock(from);
    expect(span).toBeGreaterThanOrEqual(DEMAND_WINDOW_DAYS * 86_400);
    expect(span - DEMAND_WINDOW_DAYS * 86_400).toBeLessThan(2);
  }, 15_000);
});
