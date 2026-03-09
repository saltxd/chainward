/**
 * Normalized activity from a webhook payload.
 * Provider implementations must map their native format to this shape.
 */
export interface NormalizedActivity {
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  category: string;
  rawContract?: {
    rawValue: string;
    address: string;
    decimals: number;
  };
  network: string;
}

export interface TransferRecord {
  hash: string;
  blockNum: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  rawContract: {
    rawValue: string | null;
    address: string | null;
    decimal: string | null;
  };
  metadata: {
    blockTimestamp: string;
  } | null;
}

export interface TokenBalanceRecord {
  contractAddress: string;
  tokenBalance: string;
  error: string | null;
}

export interface WebhookProvider {
  init(): void;
  addAddress(address: string): Promise<void>;
  removeAddress(address: string): Promise<void>;
  verifySignature(rawBody: string, signature: string): boolean;
  parsePayload(rawBody: string): NormalizedActivity[];
}

export interface ChainDataProvider {
  getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]>;

  getTokenBalances(address: string): Promise<TokenBalanceRecord[]>;

  getNativeBalance(address: string): Promise<string>;
}
