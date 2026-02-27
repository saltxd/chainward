import type { ChainConfig, SupportedChain } from '../types/chain.js';

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  base: {
    id: 'base',
    name: 'Base',
    chainId: 8453,
    rpcUrl: '', // set via env
    explorerUrl: 'https://basescan.org',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/address/',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18,
    },
    isEvm: true,
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    chainId: null,
    rpcUrl: '', // set via env
    explorerUrl: 'https://solscan.io',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/account/',
    nativeToken: {
      symbol: 'SOL',
      decimals: 9,
    },
    isEvm: false,
  },
} as const;

export function getExplorerTxUrl(chain: SupportedChain, txHash: string): string {
  const config = CHAIN_CONFIGS[chain];
  return `${config.explorerUrl}${config.explorerTxPath}${txHash}`;
}

export function getExplorerAddressUrl(chain: SupportedChain, address: string): string {
  const config = CHAIN_CONFIGS[chain];
  return `${config.explorerUrl}${config.explorerAddressPath}${address}`;
}
