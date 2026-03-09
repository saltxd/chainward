import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { logger } from '../../lib/logger.js';

interface AlchemyRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: { code: number; message: string };
}

export class AlchemyChainDataProvider implements ChainDataProvider {
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
      maxCount: `0x${(params.maxCount ?? 25).toString(16)}`,
      order: 'desc',
      withMetadata: true,
    };

    if (params.fromBlock) {
      rpcParams.fromBlock = params.fromBlock;
    }

    if (params.direction === 'inbound') {
      rpcParams.toAddress = params.address;
    } else {
      rpcParams.fromAddress = params.address;
    }

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

    if (!response.ok) {
      logger.error(
        { status: response.status, direction: params.direction, address: params.address },
        'getTransferHistory HTTP error',
      );
      throw new Error(`getTransferHistory failed with status ${response.status}`);
    }

    const data = (await response.json()) as AlchemyRpcResponse<{ transfers: TransferRecord[] }>;

    if (data.error) {
      logger.error(
        { rpcError: data.error, direction: params.direction, address: params.address },
        'getTransferHistory RPC error',
      );
      throw new Error(data.error.message);
    }

    return data.result.transfers;
  }

  async getTokenBalances(address: string): Promise<TokenBalanceRecord[]> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'alchemy_getTokenBalances',
        params: [address],
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status, address }, 'getTokenBalances HTTP error');
      throw new Error(`getTokenBalances failed with status ${response.status}`);
    }

    const data = (await response.json()) as AlchemyRpcResponse<{
      address: string;
      tokenBalances: TokenBalanceRecord[];
    }>;

    if (data.error) {
      logger.error({ rpcError: data.error, address }, 'getTokenBalances RPC error');
      throw new Error(data.error.message);
    }

    return data.result.tokenBalances;
  }

  async getNativeBalance(address: string): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status, address }, 'getNativeBalance HTTP error');
      throw new Error(`getNativeBalance failed with status ${response.status}`);
    }

    const data = (await response.json()) as AlchemyRpcResponse<string>;

    if (data.error) {
      logger.error({ rpcError: data.error, address }, 'getNativeBalance RPC error');
      throw new Error(data.error.message);
    }

    return data.result;
  }
}
