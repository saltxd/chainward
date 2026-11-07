import { describe, it, expect } from 'vitest';
import { buildSnapshotRows } from '../snapshotRows.js';

const USDC = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 };
const now = new Date('2026-11-06T12:00:00Z');
const W = '0xbba2379f5cc9a2f248c5cf18ad72379ae2478f42';

describe('buildSnapshotRows', () => {
  it('writes a token row next to the ETH row, so observatory wallets that hold USDC are not shown as ETH only', () => {
    const rows = buildSnapshotRows({
      wallets: [W],
      ethBalances: new Map([[W, 10n ** 18n]]),
      tokenBalances: new Map([[W, new Map([['USDC', 12_688_430_000n]])]]),
      tokens: [USDC],
      prices: new Map([['ETH', 2000], ['USDC', 1]]),
      now,
    });
    expect(rows).toHaveLength(2);
    const eth = rows.find((r) => r.tokenAddress === null)!;
    const usdc = rows.find((r) => r.tokenSymbol === 'USDC')!;
    expect(eth.balanceUsd).toBe('2000.000000');
    expect(usdc.tokenAddress).toBe(USDC.address);
    expect(usdc.balanceRaw).toBe('12688430000');
    expect(usdc.balanceUsd).toBe('12688.430000');
  });

  it('skips zero token balances and leaves USD null when no price is known', () => {
    const rows = buildSnapshotRows({
      wallets: [W],
      ethBalances: new Map([[W, 5n]]),
      tokenBalances: new Map(),
      tokens: [USDC],
      prices: new Map(),
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.balanceUsd).toBeNull();
  });
});
