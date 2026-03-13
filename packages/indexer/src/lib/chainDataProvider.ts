import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { logger } from './logger.js';

interface AlchemyTransferResult {
  transfers: TransferRecord[];
  pageKey?: string;
}

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
    const perPage = params.maxCount ?? 1000;
    const maxPages = 10; // Safety cap: 10 pages = up to 10,000 transfers per direction
    const allTransfers: TransferRecord[] = [];
    let pageKey: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const rpcParams: Record<string, unknown> = {
        category: params.categories ?? ['external', 'erc20'],
        maxCount: `0x${perPage.toString(16)}`,
        order: 'desc',
        withMetadata: true,
      };

      if (params.fromBlock) rpcParams.fromBlock = params.fromBlock;
      if (pageKey) rpcParams.pageKey = pageKey;

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

        const data = (await response.json()) as AlchemyRpcResponse<AlchemyTransferResult>;

        if (!response.ok || data.error) {
          logger.error({ status: response.status, error: data.error }, 'getTransferHistory failed');
          break;
        }

        const transfers = data.result?.transfers ?? [];
        allTransfers.push(...transfers);

        logger.debug(
          { direction: params.direction, page: page + 1, count: transfers.length, hasMore: !!data.result?.pageKey },
          'Fetched transfer page',
        );

        // If no pageKey in response, we've fetched all pages
        if (!data.result?.pageKey) break;
        pageKey = data.result.pageKey;
      } catch (err) {
        logger.error({ err, page: page + 1 }, 'Failed to fetch transfer history page');
        break;
      }
    }

    return allTransfers;
  }

  async getTokenBalances(_address: string): Promise<TokenBalanceRecord[]> {
    throw new Error('getTokenBalances not implemented in indexer — use API provider');
  }

  async getNativeBalance(_address: string): Promise<string> {
    throw new Error('getNativeBalance not implemented in indexer — use API provider');
  }
}
