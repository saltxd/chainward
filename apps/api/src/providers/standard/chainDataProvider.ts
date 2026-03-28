import {
  createPublicClient,
  http,
  fallback,
  parseAbiItem,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';
import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { logger } from '../../lib/logger.js';

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Max block lookback for eth_getLogs to avoid reth timeout (reth default limit: 10,000 blocks) */
const MAX_LOG_LOOKBACK = 10_000n;

/** Known tokens to check balances for */
const TRACKED_TOKENS: Array<{ address: `0x${string}`; decimals: number; symbol: string }> = [
  { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI' },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, symbol: 'USDbC' },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18, symbol: 'cbETH' },
  { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18, symbol: 'wstETH' },
  { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, symbol: 'VIRTUAL' },
];

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class StandardChainDataProvider implements ChainDataProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  constructor(rpcUrl: string, fallbackUrl?: string) {
    const primary = http(rpcUrl, { timeout: 5_000 });
    this.client = createPublicClient({
      chain: base,
      transport: fallbackUrl
        ? fallback([primary, http(fallbackUrl, { timeout: 10_000 })], { rank: false })
        : primary,
      batch: { multicall: true },
    });
  }

  async getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]> {
    const address = params.address as `0x${string}`;
    const maxCount = params.maxCount ?? 25;

    // Determine fromBlock with a safe lookback guard
    const currentBlock = await this.client.getBlockNumber();
    let fromBlock: bigint;
    if (params.fromBlock) {
      fromBlock = BigInt(params.fromBlock);
    } else {
      fromBlock = currentBlock > MAX_LOG_LOOKBACK ? currentBlock - MAX_LOG_LOOKBACK : 0n;
    }

    const transfers: TransferRecord[] = [];

    const logs = await this.client.getLogs({
      event: ERC20_TRANSFER_EVENT,
      args: params.direction === 'outbound' ? { from: address } : { to: address },
      fromBlock,
      toBlock: 'latest',
    });

    for (const log of logs.slice(0, maxCount)) {
      transfers.push({
        hash: log.transactionHash ?? '0x',
        blockNum: `0x${(log.blockNumber ?? 0n).toString(16)}`,
        from: log.args.from ?? '0x',
        to: log.args.to ?? null,
        value: null, // Let consumers handle decimal formatting via rawContract
        asset: null,
        category: 'erc20',
        rawContract: {
          rawValue: log.args.value?.toString() ?? null,
          address: log.address ?? null,
          decimal: null,
        },
        metadata: null,
      });
    }

    return transfers;
  }

  async getTokenBalances(address: string): Promise<TokenBalanceRecord[]> {
    const results = await this.client.multicall({
      contracts: TRACKED_TOKENS.map((token) => ({
        address: token.address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })),
    });

    return (results as Array<{ status: string; result?: bigint; error?: Error }>).map((result, i: number) => ({
      contractAddress: TRACKED_TOKENS[i]!.address,
      tokenBalance: result.status === 'success' && result.result != null ? `0x${result.result.toString(16)}` : '0x0',
      error: result.status === 'failure' && result.error ? result.error.message : null,
    }));
  }

  async getNativeBalance(address: string): Promise<string> {
    const balance = await this.client.getBalance({ address: address as `0x${string}` });
    return `0x${balance.toString(16)}`;
  }
}
