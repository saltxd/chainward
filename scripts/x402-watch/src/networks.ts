/**
 * Network facts the Oct 21 lint run classified with (its lintlib.py, rpccheck.mjs),
 * carried over unchanged so the watch judges an endpoint the way the study did.
 */

/** x402 v1 network names for EVM chains, and their CAIP-2 ids. */
export const V1_EVM: Readonly<Record<string, string>> = {
  ethereum: 'eip155:1',
  sepolia: 'eip155:11155111',
  abstract: 'eip155:2741',
  'abstract-testnet': 'eip155:11124',
  'base-sepolia': 'eip155:84532',
  base: 'eip155:8453',
  'avalanche-fuji': 'eip155:43113',
  avalanche: 'eip155:43114',
  iotex: 'eip155:4689',
  sei: 'eip155:1329',
  'sei-testnet': 'eip155:1328',
  polygon: 'eip155:137',
  'polygon-amoy': 'eip155:80002',
  peaq: 'eip155:3338',
  story: 'eip155:1514',
  educhain: 'eip155:41923',
  'skale-base-sepolia': 'eip155:324705682',
  megaeth: 'eip155:4326',
  monad: 'eip155:143',
  stable: 'eip155:988',
  'stable-testnet': 'eip155:2201',
  celo: 'eip155:42220',
  flare: 'eip155:14',
};

/** The CAIP-2 ids for v1's Solana names, for the fix line only (the stock buyer is EVM). */
export const V1_SOLANA: Readonly<Record<string, string>> = {
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

export const TESTNET_NETS: ReadonlySet<string> = new Set([
  'eip155:84532',
  'eip155:11155111',
  'eip155:421614',
  'eip155:80002',
  'eip155:43113',
  'eip155:11155420',
  'eip155:1328',
  'eip155:2201',
  'eip155:11142220',
  'eip155:5042002',
  'eip155:324705682',
]);

/** Testnet USDC deployments, to catch one offered under a mainnet id. */
export const TESTNET_ASSETS: Readonly<Record<string, string>> = {
  '0x036cbd53842c5426634e7929541ec2318f3dcf7e': 'eip155:84532',
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 'eip155:11155111',
  '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d': 'eip155:421614',
  '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582': 'eip155:80002',
  '0x5425890298aed601595a70ab815c96711a31bc65': 'eip155:43113',
  '0x5fd84259d66cd46123540766be93dfe6d43130d7': 'eip155:11155420',
};

/** Mainnet USDC deployments, to catch one offered under a testnet id. */
export const MAINNET_ASSETS: Readonly<Record<string, string>> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'eip155:8453',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'eip155:1',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'eip155:137',
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'eip155:42161',
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 'eip155:10',
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'eip155:43114',
};

/**
 * Keyless public RPCs (the lint run's list). Override per chain in <home>/rpc.json;
 * an override may carry a key, so no RPC URL is ever printed or written to a report.
 */
export const PUBLIC_RPC: Readonly<Record<string, string>> = {
  'eip155:1': 'https://ethereum-rpc.publicnode.com',
  'eip155:8453': 'https://mainnet.base.org',
  'eip155:84532': 'https://sepolia.base.org',
  'eip155:137': 'https://polygon-bor-rpc.publicnode.com',
  'eip155:42161': 'https://arb1.arbitrum.io/rpc',
  'eip155:421614': 'https://sepolia-rollup.arbitrum.io/rpc',
  'eip155:10': 'https://mainnet.optimism.io',
  'eip155:43114': 'https://api.avax.network/ext/bc/C/rpc',
  'eip155:143': 'https://rpc.monad.xyz',
  'eip155:42220': 'https://forno.celo.org',
  'eip155:1329': 'https://evm-rpc.sei-apis.com',
  'eip155:480': 'https://worldchain-mainnet.g.alchemy.com/public',
  'eip155:56': 'https://bsc-dataseed.bnbchain.org',
  'eip155:196': 'https://rpc.xlayer.tech',
  'eip155:999': 'https://rpc.hyperliquid.xyz/evm',
  'eip155:130': 'https://mainnet.unichain.org',
  'eip155:146': 'https://rpc.soniclabs.com',
  'eip155:4326': 'https://mainnet.megaeth.com/rpc',
  'eip155:42793': 'https://node.mainnet.etherlink.com',
  'eip155:50': 'https://rpc.xdc.org',
  'eip155:80002': 'https://polygon-amoy-bor-rpc.publicnode.com',
  'eip155:5042002': 'https://rpc.testnet.arc.network',
  'eip155:988': 'https://rpc.stable.xyz',
  'eip155:14': 'https://flare-api.flare.network/ext/C/rpc',
};

const CHAIN_NAMES: Readonly<Record<string, string>> = {
  'eip155:1': 'Ethereum',
  'eip155:10': 'OP Mainnet',
  'eip155:14': 'Flare',
  'eip155:50': 'XDC',
  'eip155:56': 'BNB Chain',
  'eip155:130': 'Unichain',
  'eip155:137': 'Polygon',
  'eip155:143': 'Monad',
  'eip155:146': 'Sonic',
  'eip155:196': 'X Layer',
  'eip155:324': 'zkSync Era',
  'eip155:480': 'World Chain',
  'eip155:988': 'Stable',
  'eip155:999': 'HyperEVM',
  'eip155:1329': 'Sei',
  'eip155:1514': 'Story',
  'eip155:2741': 'Abstract',
  'eip155:3338': 'peaq',
  'eip155:4326': 'MegaETH',
  'eip155:4689': 'IoTeX',
  'eip155:8453': 'Base',
  'eip155:41923': 'EDU Chain',
  'eip155:42161': 'Arbitrum',
  'eip155:42220': 'Celo',
  'eip155:42793': 'Etherlink',
  'eip155:43114': 'Avalanche',
  'eip155:59144': 'Linea',
  'eip155:534352': 'Scroll',
  'eip155:84532': 'Base Sepolia',
  'eip155:11155111': 'Sepolia',
};

/** The CAIP-2 id of an EVM network, from either naming scheme; null for anything else. */
export function evmCaip2(network: unknown): string | null {
  if (typeof network !== 'string') return null;
  if (network.startsWith('eip155:')) return network;
  return V1_EVM[network] ?? null;
}

export function chainId(caip2: string): number {
  return Number(caip2.split(':')[1]);
}

/** "Base (eip155:8453)", or the id alone for a chain we have no name for. */
export function chainLabel(network: unknown): string {
  const caip = evmCaip2(network);
  if (!caip) return `'${String(network)}'`;
  const name = CHAIN_NAMES[caip];
  return name ? `${name} (${caip})` : caip;
}

/** "Base", or the CAIP-2 id. */
export function chainName(network: unknown): string {
  const caip = evmCaip2(network);
  return (caip && CHAIN_NAMES[caip]) || String(network);
}
