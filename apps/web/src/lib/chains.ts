/**
 * The chains the public risk check runs on, as the web app needs them: labels,
 * native asset, explorer links, and the `?chain=` query convention. Mirrors
 * RISK_CHAINS in @chainward/common (the API is the authority — the web only
 * needs presentation + routing). Base is the default and keeps bare URLs.
 */

export type RiskChainParam = 'base' | 'bsc';

export const DEFAULT_CHAIN: RiskChainParam = 'base';

export const CHAIN_IDS: readonly RiskChainParam[] = ['base', 'bsc'];

export interface ChainMeta {
  id: RiskChainParam;
  name: string;
  shortName: string;
  nativeSymbol: string;
  explorerName: string;
  explorerAddressUrl: (address: string) => string;
  explorerTxUrl: (hash: string) => string;
  /** The data source wording the report may truthfully use for this chain. */
  readsFrom: string;
}

export const CHAINS: Record<RiskChainParam, ChainMeta> = {
  base: {
    id: 'base',
    name: 'Base',
    shortName: 'Base',
    nativeSymbol: 'ETH',
    explorerName: 'BaseScan',
    explorerAddressUrl: (a) => `https://basescan.org/address/${a}`,
    explorerTxUrl: (h) => `https://basescan.org/tx/${h}`,
    readsFrom: 'the chain',
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Chain',
    shortName: 'BSC',
    nativeSymbol: 'BNB',
    explorerName: 'BscScan',
    explorerAddressUrl: (a) => `https://bscscan.com/address/${a}`,
    explorerTxUrl: (h) => `https://bscscan.com/tx/${h}`,
    readsFrom: 'public BNB Chain RPC',
  },
};

export function isChainParam(value: unknown): value is RiskChainParam {
  return typeof value === 'string' && (CHAIN_IDS as readonly string[]).includes(value);
}

/** Absent → base; unknown → null so pages can 404 instead of guessing. */
export function parseChainParam(value: string | string[] | undefined | null): RiskChainParam | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined || v === null || v === '') return DEFAULT_CHAIN;
  return isChainParam(v) ? v : null;
}

/** `?chain=bsc` for non-default chains, '' for base — appended to report paths. */
export function chainQuery(chain: RiskChainParam | string | undefined): string {
  return chain && chain !== DEFAULT_CHAIN ? `?chain=${chain}` : '';
}

export function chainMeta(chain: RiskChainParam | string | undefined): ChainMeta {
  return isChainParam(chain) ? CHAINS[chain] : CHAINS[DEFAULT_CHAIN];
}
