import { describe, it, expect } from 'vitest';
import { mapLogsToTransfers } from '../src/data-fetch.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';

function log(over: Record<string, unknown> = {}): any {
  return {
    address: TOKEN,
    topics: [TRANSFER, pad(A), pad(B)],
    blockNumber: '0x64', // 100
    transactionHash: '0xtx1',
    logIndex: '0x0',
    ...over,
  };
}

describe('mapLogsToTransfers', () => {
  it('decodes from/to/token and stamps the head-block timestamp at the head block', () => {
    const headNum = 200;
    const headTs = 1_000_000; // seconds
    const { items } = mapLogsToTransfers([log({ blockNumber: '0xc8' })], headNum, headTs, 2000); // 0xc8 = 200 = head
    expect(items).toHaveLength(1);
    expect(items[0]!.from.hash).toBe(A);
    expect(items[0]!.to.hash).toBe(B);
    expect(items[0]!.token.address).toBe(TOKEN);
    expect(new Date(items[0]!.timestamp).getTime()).toBe(headTs * 1000);
  });

  it('approximates older-block timestamps via ~2s/block', () => {
    const { items } = mapLogsToTransfers([log({ blockNumber: '0x96' })], 200, 1_000_000, 2000); // 150 → 50 blocks back
    expect(new Date(items[0]!.timestamp).getTime()).toBe((1_000_000 - 50 * 2) * 1000);
  });

  it('excludes ERC-721 (4 topics) and non-Transfer logs', () => {
    const erc721 = log({ topics: [TRANSFER, pad(A), pad(B), '0x0'], logIndex: '0x1' });
    const other = log({ topics: ['0xdeadbeef', pad(A), pad(B)], logIndex: '0x2' });
    expect(mapLogsToTransfers([erc721, other], 200, 1_000_000, 2000).items).toHaveLength(0);
  });

  it('dedupes by txHash:logIndex', () => {
    expect(mapLogsToTransfers([log(), log()], 200, 1_000_000, 2000).items).toHaveLength(1);
  });

  it('sorts newest-first and caps, keeping the most-recent + flagging truncation', () => {
    const older = log({ blockNumber: '0x1', transactionHash: '0xa', logIndex: '0x0' });
    const newer = log({ blockNumber: '0x2', transactionHash: '0xb', logIndex: '0x0' });
    const { items, truncated } = mapLogsToTransfers([older, newer], 200, 1_000_000, 1);
    expect(items).toHaveLength(1);
    expect(truncated).toBe(true);
    // kept the newer log (block 2), not the older (block 1)
    expect(new Date(items[0]!.timestamp).getTime()).toBe((1_000_000 - (200 - 2) * 2) * 1000);
  });
});
