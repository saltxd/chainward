import { formatEther, formatUnits } from 'viem';
import type { balanceSnapshots } from '@chainward/db';

type Token = { readonly address: string; readonly symbol: string; readonly decimals: number };

export interface SnapshotInput {
  wallets: string[];
  ethBalances: Map<string, bigint>;
  /** wallet -> token symbol -> raw balance (zero balances already omitted) */
  tokenBalances: Map<string, Map<string, bigint>>;
  tokens: readonly Token[];
  prices: Map<string, number>;
  now: Date;
}

/** One ETH row per wallet plus one row per non-zero tracked token. */
export function buildSnapshotRows(input: SnapshotInput): Array<typeof balanceSnapshots.$inferInsert> {
  const { wallets, ethBalances, tokenBalances, tokens, prices, now } = input;
  const ethPrice = prices.get('ETH') ?? null;
  const rows: Array<typeof balanceSnapshots.$inferInsert> = [];

  for (const wallet of wallets) {
    const ethBal = ethBalances.get(wallet);
    if (ethBal != null) {
      const amount = parseFloat(formatEther(ethBal));
      rows.push({
        timestamp: now,
        chain: 'base',
        walletAddress: wallet,
        tokenAddress: null,
        tokenSymbol: 'ETH',
        balanceRaw: ethBal.toString(),
        balanceUsd: ethPrice ? (amount * ethPrice).toFixed(6) : null,
        snapshotType: 'periodic',
      });
    }

    const held = tokenBalances.get(wallet);
    if (!held) continue;
    for (const token of tokens) {
      const bal = held.get(token.symbol);
      if (!bal) continue;
      const price = prices.get(token.symbol.toUpperCase()) ?? null;
      const amount = parseFloat(formatUnits(bal, token.decimals));
      rows.push({
        timestamp: now,
        chain: 'base',
        walletAddress: wallet,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        balanceRaw: bal.toString(),
        balanceUsd: price ? (amount * price).toFixed(6) : null,
        snapshotType: 'periodic',
      });
    }
  }
  return rows;
}
