import type { SupportedChain } from './chain.js';

export const TX_DIRECTIONS = ['in', 'out', 'self'] as const;
export type TxDirection = (typeof TX_DIRECTIONS)[number];

export const TX_TYPES = [
  'transfer',
  'swap',
  'contract_call',
  'approval',
  'x402_payment',
  'unknown',
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_STATUSES = ['confirmed', 'failed', 'pending'] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export interface Transaction {
  timestamp: Date;
  chain: SupportedChain;
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  direction: TxDirection;
  counterparty: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  amountRaw: string | null;
  amountUsd: number | null;
  gasUsed: number | null;
  gasPriceGwei: number | null;
  gasCostNative: string | null;
  gasCostUsd: number | null;
  txType: TxType;
  methodId: string | null;
  methodName: string | null;
  contractAddress: string | null;
  status: TxStatus;
  ingestedAt: Date;
}

export interface TransactionFilter {
  walletAddress?: string;
  chain?: SupportedChain;
  direction?: TxDirection;
  txType?: TxType;
  status?: TxStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}
