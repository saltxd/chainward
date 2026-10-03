import { describe, expect, it } from 'vitest';
import {
  RISK_CHAINS,
  RISK_CHAIN_IDS,
  isHighVolumeContract,
  isRiskChainId,
  parseRiskChain,
  riskChainAddressUrl,
  riskChainExplorerApiKey,
  riskChainRpcs,
  riskChainStablecoin,
  riskChainTxUrl,
} from '../constants/riskChains.js';

describe('risk chain registry', () => {
  it('registers base and bsc with consistent ids and chain ids', () => {
    expect(RISK_CHAIN_IDS).toEqual(['base', 'bsc']);
    for (const id of RISK_CHAIN_IDS) expect(RISK_CHAINS[id].id).toBe(id);
    expect(RISK_CHAINS.base.chainId).toBe(8453);
    expect(RISK_CHAINS.bsc.chainId).toBe(56);
    expect(RISK_CHAINS.bsc.nativeSymbol).toBe('BNB');
  });

  it('carries the BSC contract set the check depends on', () => {
    expect(riskChainStablecoin('bsc', 'USDC')).toEqual({
      symbol: 'USDC',
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
    });
    expect(riskChainStablecoin('bsc', 'USDT')?.address).toBe('0x55d398326f99059fF775485246999027B3197955');
    expect(RISK_CHAINS.bsc.wrappedNative.address).toBe('0xbb4CdB9CBd36B01bD1cBaEbF2De08d9173bc095c');
    expect(RISK_CHAINS.bsc.identityRegistry).toBe('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
    // Base USDC is 6 decimals, BSC USDC is 18 — the balance math must not assume 6.
    expect(riskChainStablecoin('base', 'USDC')?.decimals).toBe(6);
  });

  it('knows which optional sources exist per chain', () => {
    expect(RISK_CHAINS.base.sources).toEqual({ acp: true, attestation: 'eas' });
    expect(RISK_CHAINS.bsc.sources).toEqual({ acp: false, attestation: null });
    expect(RISK_CHAINS.base.blockscoutUrl).toBeDefined();
    expect(RISK_CHAINS.bsc.blockscoutUrl).toBeUndefined();
  });

  it('keeps high-volume contract lists lowercase and matches case-insensitively', () => {
    for (const id of RISK_CHAIN_IDS) {
      for (const a of RISK_CHAINS[id].highVolumeContracts) expect(a).toBe(a.toLowerCase());
    }
    expect(isHighVolumeContract('bsc', '0x10ED43C718714eb63d5aA57B78B54704E256024E')).toBe(true);
    // The ERC-4337 entrypoints are shared across chains.
    expect(isHighVolumeContract('base', '0x0000000071727De22E5E9d8BAf0edAc6f37da032')).toBe(true);
    expect(isHighVolumeContract('bsc', '0x0000000071727De22E5E9d8BAf0edAc6f37da032')).toBe(true);
    expect(isHighVolumeContract('bsc', '0x' + '1'.repeat(40))).toBe(false);
  });

  it('builds explorer links per chain', () => {
    expect(riskChainTxUrl('bsc', '0xabc')).toBe('https://bscscan.com/tx/0xabc');
    expect(riskChainAddressUrl('bsc', '0xdef')).toBe('https://bscscan.com/address/0xdef');
    expect(riskChainAddressUrl('base', '0xdef')).toBe('https://basescan.org/address/0xdef');
  });

  it('parses chain input: default for absent, null for unknown', () => {
    expect(parseRiskChain(undefined)).toBe('base');
    expect(parseRiskChain('')).toBe('base');
    expect(parseRiskChain('bsc')).toBe('bsc');
    expect(parseRiskChain('BSC')).toBeNull();
    expect(parseRiskChain('solana')).toBeNull();
    expect(isRiskChainId('bsc')).toBe(true);
    expect(isRiskChainId(56)).toBe(false);
  });

  it('resolves the BSC RPC list from env with keyless defaults', () => {
    const defaults = riskChainRpcs('bsc', {});
    expect(defaults[0]).toEqual({ url: 'https://rpc.sentio.xyz/bsc', logChunkBlocks: 10_000 });
    expect(defaults.map((r) => r.url)).toContain('https://public-bsc.nownodes.io');
    expect(defaults.map((r) => r.url)).toContain('https://56.rpc.thirdweb.com');

    const custom = riskChainRpcs('bsc', {
      BSC_RPC_URL: 'https://my-node.example/bsc',
      BSC_RPC_LOG_CHUNK_BLOCKS: '2500',
      BSC_RPC_FALLBACK_URLS: 'https://a.example, https://b.example,',
    });
    expect(custom).toEqual([
      { url: 'https://my-node.example/bsc', logChunkBlocks: 2500 },
      { url: 'https://a.example', logChunkBlocks: 10_000 },
      { url: 'https://b.example', logChunkBlocks: 10_000 },
    ]);
  });

  it('drops a fallback that duplicates the primary and ignores a bad chunk override', () => {
    const rpcs = riskChainRpcs('bsc', {
      BSC_RPC_URL: 'https://public-bsc.nownodes.io',
      BSC_RPC_LOG_CHUNK_BLOCKS: 'lots',
    });
    expect(rpcs[0]).toEqual({ url: 'https://public-bsc.nownodes.io', logChunkBlocks: 10_000 });
    expect(rpcs.filter((r) => r.url === 'https://public-bsc.nownodes.io')).toHaveLength(1);
  });

  it('exposes the BscScan key only when set, and never for chains without an API', () => {
    expect(riskChainExplorerApiKey('bsc', {})).toBeUndefined();
    expect(riskChainExplorerApiKey('bsc', { BSCSCAN_API_KEY: '' })).toBeUndefined();
    expect(riskChainExplorerApiKey('bsc', { BSCSCAN_API_KEY: 'k' })).toBe('k');
    expect(riskChainExplorerApiKey('base', { BSCSCAN_API_KEY: 'k' })).toBeUndefined();
  });
});
