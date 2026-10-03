/**
 * Chain registry for the public risk check.
 *
 * One entry per chain the free check can run on. Everything chain-specific the
 * check needs lives here — RPC env vars + keyless defaults, explorer URL
 * templates, stablecoins, the ERC-8004 identity registry, and the busy shared
 * contracts (routers / entrypoints) that are never an agent wallet — so the
 * decode engine, the API and the web read one source instead of hardcoding Base.
 *
 * `base` keeps its existing Blockscout + own-node path; `bsc` has no Blockscout
 * and is read from public JSON-RPC only (see packages/decode/src/rpc-fixtures.ts).
 */

export const RISK_CHAIN_IDS = ['base', 'bsc'] as const;
export type RiskChainId = (typeof RISK_CHAIN_IDS)[number];

export interface RiskChainRpc {
  url: string;
  /**
   * Largest eth_getLogs block span this endpoint accepts (measured, not
   * documented). The log scanner starts here and halves on a range error.
   */
  logChunkBlocks: number;
}

export interface RiskChainToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface RiskChain {
  id: RiskChainId;
  /** Display name ("BNB Chain"). */
  name: string;
  /** Short label for chips / tags ("BSC"). */
  shortName: string;
  chainId: number;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Rough seconds per block — a fallback only; the scanner measures the real rate. */
  blockSecondsEstimate: number;
  rpc: {
    /** Env var naming the primary RPC URL. */
    envVar: string;
    /** Keyless default used when the env var is unset. */
    defaultUrl: string;
    /** Env var overriding the primary's eth_getLogs span (blocks). */
    logChunkEnvVar: string;
    defaultLogChunkBlocks: number;
    /** Env var with a comma-separated list of fallback RPC URLs. */
    fallbackEnvVar: string;
    defaultFallbacks: RiskChainRpc[];
  };
  explorer: {
    name: string;
    baseUrl: string;
    txPath: string;
    addressPath: string;
    /** Etherscan-family API (optional key). Absent when the chain has no such API wired. */
    api?: { url: string; chainId: number; keyEnvVar: string };
  };
  /** Blockscout API root, when the chain has one we use. */
  blockscoutUrl?: string;
  stablecoins: RiskChainToken[];
  wrappedNative: RiskChainToken;
  /** ERC-8004 Identity Registry (same address on both chains). */
  identityRegistry: string;
  /**
   * Busy shared contracts (lowercase) that are never an agent wallet: ERC-4337
   * entrypoints, DEX routers, Permit2. Used by the high-volume check.
   */
  highVolumeContracts: readonly string[];
  /** Which optional data sources exist on this chain. */
  sources: {
    /** Virtuals ACP agent registry (handles, claims, peers). */
    acp: boolean;
    /** Attestation rail for ChainWard Attest; null = not attested on this chain yet. */
    attestation: 'eas' | null;
  };
}

const ENTRYPOINT_V06 = '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const ENTRYPOINT_V07 = '0x0000000071727de22e5e9d8baf0edac6f37da032';
const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

export const RISK_CHAINS: Record<RiskChainId, RiskChain> = {
  base: {
    id: 'base',
    name: 'Base',
    shortName: 'Base',
    chainId: 8453,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockSecondsEstimate: 2,
    rpc: {
      envVar: 'SENTINEL_RPC',
      defaultUrl: 'https://mainnet.base.org',
      logChunkEnvVar: 'SENTINEL_TRANSFER_CHUNK_BLOCKS',
      defaultLogChunkBlocks: 100_000,
      fallbackEnvVar: 'BASE_RPC_FALLBACK_URL',
      defaultFallbacks: [],
    },
    explorer: {
      name: 'BaseScan',
      baseUrl: 'https://basescan.org',
      txPath: '/tx/',
      addressPath: '/address/',
    },
    blockscoutUrl: 'https://base.blockscout.com',
    stablecoins: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    ],
    wrappedNative: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    identityRegistry: IDENTITY_REGISTRY,
    highVolumeContracts: [
      ENTRYPOINT_V06,
      ENTRYPOINT_V07,
      PERMIT2,
      '0x6ff5693b99212da76ad316178a184ab56d299b43', // Uniswap Universal Router (Base)
      '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router (legacy)
      '0x2626664c2603336e57b271c5c0b26f421741e481', // Uniswap SwapRouter02 (Base)
      '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', // Aerodrome Router
      '0x498581ff718922c3f8e6a244956af099b2652b2b', // Uniswap v4 PoolManager (Base)
    ],
    sources: { acp: true, attestation: 'eas' },
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Chain',
    shortName: 'BSC',
    chainId: 56,
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    // Post-Maxwell BSC produces a block every ~0.45s (measured 2026-10-03 over a
    // 100k-block span). Kept as an estimate only; the scanner derives the real rate.
    blockSecondsEstimate: 0.45,
    rpc: {
      envVar: 'BSC_RPC_URL',
      // Keyless, full log history + archive state; 10,000-block eth_getLogs cap.
      defaultUrl: 'https://rpc.sentio.xyz/bsc',
      logChunkEnvVar: 'BSC_RPC_LOG_CHUNK_BLOCKS',
      defaultLogChunkBlocks: 10_000,
      fallbackEnvVar: 'BSC_RPC_FALLBACK_URLS',
      defaultFallbacks: [
        // Full history, ~200k-block spans OK but ~4s per call and a 30s server timeout.
        { url: 'https://public-bsc.nownodes.io', logChunkBlocks: 50_000 },
        // Full history, 1,000-block cap.
        { url: 'https://56.rpc.thirdweb.com', logChunkBlocks: 1_000 },
      ],
    },
    explorer: {
      name: 'BscScan',
      baseUrl: 'https://bscscan.com',
      txPath: '/tx/',
      addressPath: '/address/',
      api: { url: 'https://api.etherscan.io/v2/api', chainId: 56, keyEnvVar: 'BSCSCAN_API_KEY' },
    },
    stablecoins: [
      { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
      { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    ],
    wrappedNative: { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEbF2De08d9173bc095c', decimals: 18 },
    identityRegistry: IDENTITY_REGISTRY,
    highVolumeContracts: [
      ENTRYPOINT_V06,
      ENTRYPOINT_V07,
      PERMIT2,
      '0x10ed43c718714eb63d5aa57b78b54704e256024e', // PancakeSwap v2 Router
      '0x13f4ea83d0bd40e75c8222255bc855a974568dd4', // PancakeSwap v3 SmartRouter
      '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch AggregationRouter v5
      '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch AggregationRouter v6
    ],
    sources: { acp: false, attestation: null },
  },
};

export const DEFAULT_RISK_CHAIN: RiskChainId = 'base';

export function isRiskChainId(value: unknown): value is RiskChainId {
  return typeof value === 'string' && (RISK_CHAIN_IDS as readonly string[]).includes(value);
}

/**
 * Parses a user-supplied chain (query param, job payload, DB column). Returns
 * the default for an absent value and null for an unknown one, so callers can
 * 400 on garbage instead of silently checking the wrong chain.
 */
export function parseRiskChain(value: unknown): RiskChainId | null {
  if (value === undefined || value === null || value === '') return DEFAULT_RISK_CHAIN;
  return isRiskChainId(value) ? value : null;
}

export function getRiskChain(id: RiskChainId): RiskChain {
  return RISK_CHAINS[id];
}

export function riskChainTxUrl(chain: RiskChainId, txHash: string): string {
  const { explorer } = RISK_CHAINS[chain];
  return `${explorer.baseUrl}${explorer.txPath}${txHash}`;
}

export function riskChainAddressUrl(chain: RiskChainId, address: string): string {
  const { explorer } = RISK_CHAINS[chain];
  return `${explorer.baseUrl}${explorer.addressPath}${address}`;
}

export function riskChainStablecoin(chain: RiskChainId, symbol: string): RiskChainToken | undefined {
  return RISK_CHAINS[chain].stablecoins.find((t) => t.symbol === symbol);
}

export function isHighVolumeContract(chain: RiskChainId, address: string): boolean {
  return RISK_CHAINS[chain].highVolumeContracts.includes(address.toLowerCase());
}

type EnvLike = Record<string, string | undefined>;

function readEnv(): EnvLike {
  return (globalThis as { process?: { env?: EnvLike } }).process?.env ?? {};
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The ordered RPC list for a chain: the primary (env var or keyless default)
 * followed by the fallbacks (env list or defaults). Fallback URLs given via env
 * inherit the chain's default chunk size since their limits are unknown.
 */
export function riskChainRpcs(chain: RiskChainId, env: EnvLike = readEnv()): RiskChainRpc[] {
  const cfg = RISK_CHAINS[chain].rpc;
  const primary: RiskChainRpc = {
    url: env[cfg.envVar] || cfg.defaultUrl,
    logChunkBlocks: positiveInt(env[cfg.logChunkEnvVar], cfg.defaultLogChunkBlocks),
  };
  const rawFallbacks = env[cfg.fallbackEnvVar];
  const fallbacks: RiskChainRpc[] = rawFallbacks
    ? rawFallbacks
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
        .map((url) => ({ url, logChunkBlocks: cfg.defaultLogChunkBlocks }))
    : cfg.defaultFallbacks;
  return [primary, ...fallbacks.filter((f) => f.url !== primary.url)];
}

/** The explorer API key for a chain, if the chain has an API and the key is set. */
export function riskChainExplorerApiKey(chain: RiskChainId, env: EnvLike = readEnv()): string | undefined {
  const api = RISK_CHAINS[chain].explorer.api;
  if (!api) return undefined;
  const key = env[api.keyEnvVar];
  return key && key.length > 0 ? key : undefined;
}
