import { getBaseClient } from './viem.js';

// Native USDC on Base (6 decimals).
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export type UsdcVerifyResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: 'TX_NOT_FOUND' | 'TX_FAILED' | 'NO_MATCH' };

/**
 * Verify that `txHash` contains a USDC Transfer of at least `minAmount`
 * (micro-USDC) FROM `fromWallet` TO `toTreasury` on Base.
 *
 * Single source of truth for on-chain payment verification — used by both the
 * tier-upgrade flow (routes/payments.ts) and the paid Intel Brief flow
 * (routes/brief.ts). Read-only: confirms an already-broadcast transfer; it
 * never moves funds.
 */
export async function verifyUsdcPayment(opts: {
  txHash: string;
  fromWallet: string;
  toTreasury: string;
  minAmount: bigint;
}): Promise<UsdcVerifyResult> {
  const { txHash, fromWallet, toTreasury, minAmount } = opts;

  const client = getBaseClient();
  const receipt = await client
    .getTransactionReceipt({ hash: txHash as `0x${string}` })
    .catch(() => null);

  if (!receipt) return { ok: false, reason: 'TX_NOT_FOUND' };
  if (receipt.status !== 'success') return { ok: false, reason: 'TX_FAILED' };

  const from = fromWallet.toLowerCase();
  const to = toTreasury.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS) continue;
    if (!log.topics[0] || log.topics[0] !== TRANSFER_TOPIC) continue;

    // topics[1] = from, topics[2] = to (each padded to 32 bytes)
    const logFrom = ('0x' + log.topics[1]!.slice(26)).toLowerCase();
    const logTo = ('0x' + log.topics[2]!.slice(26)).toLowerCase();
    const value = BigInt(log.data);

    if (logFrom === from && logTo === to && value >= minAmount) {
      return { ok: true, value };
    }
  }

  return { ok: false, reason: 'NO_MATCH' };
}
