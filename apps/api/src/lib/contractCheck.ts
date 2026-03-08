import { JsonRpcProvider } from 'ethers';
import { getEnv } from '../config.js';
import { logger } from './logger.js';

let _provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!_provider) {
    _provider = new JsonRpcProvider(getEnv().BASE_RPC_URL);
  }
  return _provider;
}

/** Well-known proxy/wallet bytecode signatures */
const KNOWN_WALLET_SIGNATURES = [
  '0x6080604052', // Generic proxy prefix (Safe, ERC-4337, etc.)
];

/** Known wallet factory/singleton addresses (lowercase) */
const KNOWN_WALLET_CONTRACTS = new Set([
  '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', // Safe v1.3.0 singleton
  '0x41675c099f32341bf84bfc5382af534df5c7461a', // Safe v1.4.1 singleton
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762', // Safe v1.4.1 L2
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', // ERC-4337 EntryPoint v0.6
  '0x0000000071727de22e5e9d8baf0edac6f37da032', // ERC-4337 EntryPoint v0.7
]);

export interface ContractCheckResult {
  isContract: boolean;
  isKnownWallet: boolean;
}

/**
 * Check if an address is a contract and whether it's a known wallet type.
 * Returns { isContract: false } for EOAs (no bytecode).
 */
export async function checkAddressType(address: string): Promise<ContractCheckResult> {
  try {
    const code = await getProvider().getCode(address);

    if (code === '0x' || code === '0x0') {
      return { isContract: false, isKnownWallet: false };
    }

    // Check if this is a known wallet contract (Safe, ERC-4337 account, etc.)
    // Safe proxies delegate to a known singleton — check if bytecode contains the singleton address
    const codeLower = code.toLowerCase();
    const isKnownWallet = [...KNOWN_WALLET_CONTRACTS].some((addr) =>
      codeLower.includes(addr.slice(2)), // Check if singleton address appears in proxy bytecode
    );

    return { isContract: true, isKnownWallet };
  } catch (err) {
    logger.warn({ err, address }, 'Failed to check address type, assuming EOA');
    return { isContract: false, isKnownWallet: false };
  }
}
