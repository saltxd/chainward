import { isSpamSender } from './spam-tokens.js';
import type { QuickDecodeResultData } from './types.js';

export interface BlockscoutTransfer {
  from: { hash: string };
  to?: { hash: string };
  timestamp: string;
  token?: { symbol?: string; address?: string };
}

export function filterSpamTransfers<T extends BlockscoutTransfer>(transfers: T[]): T[] {
  return transfers.filter((t) => !isSpamSender(t.from.hash));
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function computeActivity(
  transfersRaw: BlockscoutTransfer[],
  now: Date,
): QuickDecodeResultData['activity'] {
  const transfers = filterSpamTransfers(transfersRaw);

  if (transfers.length === 0) {
    return {
      latest_transfer_at: null,
      latest_transfer_age_hours: null,
      transfers_24h: 0,
      transfers_7d: 0,
      transfers_30d: 0,
      unique_counterparties_30d: 0,
    };
  }

  const sorted = [...transfers].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const latest = sorted[0]!;
  const latestT = new Date(latest.timestamp).getTime();
  const ageHours = (now.getTime() - latestT) / HOUR_MS;

  const within = (windowMs: number) =>
    transfers.filter((t) => now.getTime() - new Date(t.timestamp).getTime() <= windowMs).length;

  const counterparties30d = new Set(
    transfers
      .filter((t) => now.getTime() - new Date(t.timestamp).getTime() <= 30 * DAY_MS)
      .flatMap((t) => [t.from.hash, t.to?.hash].filter((h): h is string => Boolean(h))),
  );

  return {
    latest_transfer_at: latest.timestamp,
    latest_transfer_age_hours: Math.round(ageHours * 100) / 100,
    transfers_24h: within(DAY_MS),
    transfers_7d: within(7 * DAY_MS),
    transfers_30d: within(30 * DAY_MS),
    unique_counterparties_30d: counterparties30d.size,
  };
}

export interface ComputeBalancesInput {
  ethBalanceWei: string;
  usdcRawBalance: string; // hex from eth_call
  ethUsdPrice: number;
  usdcUsdPrice: number;
}

export function computeBalances(
  input: ComputeBalancesInput,
): QuickDecodeResultData['balances'] {
  const ethWei = BigInt(input.ethBalanceWei);
  const usdc = Number(BigInt(input.usdcRawBalance)) / 1e6;
  const ethAmount = Number(ethWei) / 1e18;
  return {
    eth: { wei: ethWei.toString(), usd: ethAmount * input.ethUsdPrice },
    usdc: { amount: usdc, usd: usdc * input.usdcUsdPrice },
    agent_token: null,
  };
}
