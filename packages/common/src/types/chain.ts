export const SUPPORTED_CHAINS = ['base', 'solana'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export interface ChainConfig {
  id: string;
  name: string;
  chainId: number | null; // null for non-EVM (Solana)
  rpcUrl: string;
  explorerUrl: string;
  explorerTxPath: string;
  explorerAddressPath: string;
  nativeToken: {
    symbol: string;
    decimals: number;
  };
  isEvm: boolean;
}
