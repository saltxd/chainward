import { logger } from './logger.js';
import { getBaseClient } from './viem.js';

/** Known wallet factory/singleton addresses (lowercase) */
const KNOWN_WALLET_CONTRACTS = new Set([
  '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', // Safe v1.3.0 singleton
  '0x41675c099f32341bf84bfc5382af534df5c7461a', // Safe v1.4.1 singleton
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762', // Safe v1.4.1 L2
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', // ERC-4337 EntryPoint v0.6
  '0x0000000071727de22e5e9d8baf0edac6f37da032', // ERC-4337 EntryPoint v0.7
]);

/**
 * Busy shared contracts that are never an agent wallet. Watching one adds every
 * call on Base to our Alchemy webhook (lowercase).
 */
const HIGH_VOLUME_CONTRACTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', // ERC-4337 EntryPoint v0.6
  '0x0000000071727de22e5e9d8baf0edac6f37da032', // ERC-4337 EntryPoint v0.7
  '0x000000000022d473030f116ddee9f6b43ac78ba3', // Permit2
  '0x6ff5693b99212da76ad316178a184ab56d299b43', // Uniswap Universal Router (Base)
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router (legacy)
  '0x2626664c2603336e57b271c5c0b26f421741e481', // Uniswap SwapRouter02 (Base)
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', // Aerodrome Router
  '0x498581ff718922c3f8e6a244956af099b2652b2b', // Uniswap v4 PoolManager (Base)
]);

const ERC20_TOTAL_SUPPLY_ABI = [
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export interface ContractCheckResult {
  isContract: boolean;
  isKnownWallet: boolean;
  /** Token or busy shared contract: refuse to monitor, even with confirmContract. */
  isHighVolume: boolean;
}

/** ERC-20s answer totalSupply(); smart-account wallets don't. */
async function isTokenContract(address: `0x${string}`): Promise<boolean> {
  try {
    await getBaseClient().readContract({ address, abi: ERC20_TOTAL_SUPPLY_ABI, functionName: 'totalSupply' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an address is a contract and whether it's a known wallet type.
 * Returns { isContract: false } for EOAs (no bytecode).
 */
export async function checkAddressType(address: string): Promise<ContractCheckResult> {
  try {
    const addr = address as `0x${string}`;
    const code = await getBaseClient().getCode({ address: addr });

    if (!code || code === '0x' || code === '0x0') {
      return { isContract: false, isKnownWallet: false, isHighVolume: false };
    }

    const codeLower = code.toLowerCase();
    const isKnownWallet = [...KNOWN_WALLET_CONTRACTS].some((known) =>
      codeLower.includes(known.slice(2)),
    );
    const isHighVolume =
      HIGH_VOLUME_CONTRACTS.has(address.toLowerCase()) || (!isKnownWallet && (await isTokenContract(addr)));

    return { isContract: true, isKnownWallet, isHighVolume };
  } catch (err) {
    logger.warn({ err, address }, 'Failed to check address type, assuming EOA');
    return { isContract: false, isKnownWallet: false, isHighVolume: false };
  }
}
