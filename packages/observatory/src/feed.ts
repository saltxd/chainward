export interface FeedItem {
  timestamp: string;
  agentName: string;
  /** /base/<slug> page for the agent, when it has one. */
  slug: string | null;
  walletAddress: string;
  direction: string;
  tokenSymbol: string | null;
  /** null = no price for this token (e.g. tokenized stocks), not a zero-value transfer */
  amountUsd: number | null;
  gasCostUsd: number;
  txHash: string;
  txType: string;
  status: string;
}

/**
 * The wire shows what agents are doing, not one agent's token dust. Transfers
 * arrive one row per token moved, so a single swap filled all ten rows. Keep one
 * row per transaction (the largest priced transfer in it), at most `perAgent`
 * rows per wallet, newest first.
 */
export function diversifyFeed(
  rows: FeedItem[],
  opts: { perAgent?: number; limit?: number } = {},
): FeedItem[] {
  const perAgent = opts.perAgent ?? 2;
  const limit = opts.limit ?? 10;

  const byTx = new Map<string, FeedItem>();
  for (const row of rows) {
    const key = `${row.txHash.toLowerCase()}:${row.walletAddress.toLowerCase()}`;
    const kept = byTx.get(key);
    if (!kept || (row.amountUsd ?? -1) > (kept.amountUsd ?? -1)) byTx.set(key, row);
  }

  const perWallet = new Map<string, number>();
  const out: FeedItem[] = [];
  for (const row of byTx.values()) {
    const wallet = row.walletAddress.toLowerCase();
    const count = perWallet.get(wallet) ?? 0;
    if (count >= perAgent) continue;
    perWallet.set(wallet, count + 1);
    out.push(row);
  }

  return out
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
