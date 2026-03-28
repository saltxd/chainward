import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

function getClient(): PublicClient {
  if (!_client) {
    const primary = http(process.env.BASE_RPC_URL, { timeout: 5_000 });
    const fb = process.env.BASE_RPC_FALLBACK_URL;
    _client = createPublicClient({
      chain: base,
      transport: fb ? fallback([primary, http(fb, { timeout: 10_000 })], { rank: false }) : primary,
    });
  }
  return _client as PublicClient;
}

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
    const code = await getClient().getCode({ address: address as `0x${string}` });

    if (!code || code === '0x' || code === '0x0') {
      return { isContract: false, isKnownWallet: false };
    }

    const codeLower = code.toLowerCase();
    const isKnownWallet = [...KNOWN_WALLET_CONTRACTS].some((addr) =>
      codeLower.includes(addr.slice(2)),
    );

    return { isContract: true, isKnownWallet };
  } catch (err) {
    logger.warn({ err, address }, 'Failed to check address type, assuming EOA');
    return { isContract: false, isKnownWallet: false };
  }
}
