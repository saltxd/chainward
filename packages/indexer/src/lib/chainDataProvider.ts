import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { parseAbiItem } from 'viem';
import { getBaseClient } from './viem.js';
import { logger } from './logger.js';

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Max block lookback for eth_getLogs to avoid reth timeout */
const MAX_LOG_LOOKBACK = 10_000n;

export class IndexerChainDataProvider implements ChainDataProvider {
  async getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]> {
    const client = getBaseClient();
    const address = params.address as `0x${string}`;
    const maxCount = params.maxCount ?? 1000;

    // Determine fromBlock with safe lookback guard
    let fromBlock: bigint;
    if (params.fromBlock) {
      fromBlock = BigInt(params.fromBlock);
    } else {
      const currentBlock = await client.getBlockNumber();
      fromBlock = currentBlock > MAX_LOG_LOOKBACK ? currentBlock - MAX_LOG_LOOKBACK : 0n;
    }

    const logs = await client.getLogs({
      event: ERC20_TRANSFER_EVENT,
      args: params.direction === 'outbound' ? { from: address } : { to: address },
      fromBlock,
      toBlock: 'latest',
    });

    const transfers: TransferRecord[] = logs.slice(0, maxCount).map((log) => ({
      hash: log.transactionHash ?? '0x',
      blockNum: `0x${(log.blockNumber ?? 0n).toString(16)}`,
      from: log.args.from ?? '0x',
      to: log.args.to ?? null,
      value: null,
      asset: null,
      category: 'erc20',
      rawContract: {
        rawValue: log.args.value?.toString() ?? null,
        address: log.address ?? null,
        decimal: null,
      },
      metadata: null,
    }));

    logger.debug(
      { address, direction: params.direction, count: transfers.length },
      'Fetched transfer history via eth_getLogs',
    );

    return transfers;
  }

  async getTokenBalances(_address: string): Promise<TokenBalanceRecord[]> {
    throw new Error('getTokenBalances not implemented in indexer — use API provider');
  }

  async getNativeBalance(_address: string): Promise<string> {
    throw new Error('getNativeBalance not implemented in indexer — use API provider');
  }
}
