import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { logger } from './logger.js';

interface AlchemyRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: { code: number; message: string };
}

export class IndexerAlchemyProvider implements ChainDataProvider {
  constructor(private rpcUrl: string) {}

  async getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]> {
    const rpcParams: Record<string, unknown> = {
      category: params.categories ?? ['external', 'erc20'],
      maxCount: `0x${(params.maxCount ?? 1000).toString(16)}`,
      order: 'desc',
      withMetadata: true,
    };

    if (params.fromBlock) rpcParams.fromBlock = params.fromBlock;

    if (params.direction === 'inbound') {
      rpcParams.toAddress = params.address;
    } else {
      rpcParams.fromAddress = params.address;
    }

    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [rpcParams],
        }),
      });

      const data = (await response.json()) as AlchemyRpcResponse<{ transfers: TransferRecord[] }>;

      if (!response.ok || data.error) {
        logger.error({ status: response.status, error: data.error }, 'getTransferHistory failed');
        return [];
      }

      return data.result?.transfers ?? [];
    } catch (err) {
      logger.error({ err }, 'Failed to fetch transfer history');
      return [];
    }
  }

  async getTokenBalances(_address: string): Promise<TokenBalanceRecord[]> {
    throw new Error('getTokenBalances not implemented in indexer — use API provider');
  }

  async getNativeBalance(_address: string): Promise<string> {
    throw new Error('getNativeBalance not implemented in indexer — use API provider');
  }
}
