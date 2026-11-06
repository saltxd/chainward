import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseTimeOfBlock } from '@chainward/common';

// backfillAgent's 30-day window on Base: it must start at the block that is
// truly 30 days back. The chain, the DB and the processors are faked.
const HEAD = 60_000_000n;
const requested = vi.hoisted(() => ({ fromBlocks: [] as string[] }));

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/viem.js', () => ({ getBaseClient: () => ({ getBlockNumber: async () => 60_000_000n }) }));
vi.mock('../../lib/db.js', () => ({ getDb: () => ({}) }));
vi.mock('../../lib/chainDataProvider.js', () => ({
  IndexerChainDataProvider: class {
    async getTransferHistory(p: { fromBlock: string }) {
      requested.fromBlocks.push(p.fromBlock);
      return [];
    }
  },
}));
vi.mock('../../processors/tokenResolver.js', () => ({ resolveToken: vi.fn() }));
vi.mock('../../processors/protocolResolver.js', () => ({ resolveProtocol: vi.fn() }));
vi.mock('../../processors/priceResolver.js', () => ({ getEthPrice: vi.fn(), getTokenUsdPrice: vi.fn() }));
vi.mock('../../processors/decoder.js', () => ({ decodeMethod: vi.fn(), classifyTxType: vi.fn() }));
vi.mock('../../lib/transactionStore.js', () => ({ insertTransactionIfNew: vi.fn() }));

import { backfillAgent } from '../backfill.js';

describe('backfillAgent window', () => {
  beforeEach(() => {
    requested.fromBlocks.length = 0;
  });

  it('starts 30 days back by the block time schedule', async () => {
    await backfillAgent('0x68396bd35874695ad86cd29410bd80a550991a2b', 'base');
    expect(requested.fromBlocks.length).toBeGreaterThan(0);
    const from = Number(BigInt(requested.fromBlocks[0]!));
    const span = baseTimeOfBlock(Number(HEAD)) - baseTimeOfBlock(from);
    expect(span).toBeGreaterThanOrEqual(30 * 86_400);
    expect(span - 30 * 86_400).toBeLessThan(2);
  });
});
