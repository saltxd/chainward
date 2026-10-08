import { SiweMessage } from 'siwe';
import { isAddressEqual, recoverMessageAddress, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { getBaseClient } from './viem.js';
import { logger } from './logger.js';

// Sign-In with Ethereum signature check that accepts what Base users sign with.
// `siwe`'s own verify() without a provider only does ecrecover, so smart accounts
// (Coinbase Smart Wallet, Safe: ERC-1271, wrapped in ERC-6492 before deployment)
// could never log in. Order: message sanity and time window, then ecrecover
// (offline, covers every EOA), then the on-chain check for everything else.

/** Validates a non-EOA signature on-chain: ERC-1271 for deployed accounts, ERC-6492 for counterfactual ones. */
export type OnChainSignatureCheck = (args: { address: Address; message: string; signature: Hex }) => Promise<boolean>;

export type SiweVerifyResult =
  | { ok: true; message: SiweMessage }
  | { ok: false; reason: 'invalid_message' | 'wrong_chain' | 'expired' | 'not_yet_valid' | 'invalid_signature' };

/** viem's verifyMessage on the Base client: a deployless call to the universal signature validator. */
const baseOnChainCheck: OnChainSignatureCheck = ({ address, message, signature }) =>
  getBaseClient().verifyMessage({ address, message, signature });

export async function verifySiwe(
  rawMessage: string,
  signature: string,
  onChain: OnChainSignatureCheck = baseOnChainCheck,
): Promise<SiweVerifyResult> {
  let message: SiweMessage;
  try {
    message = new SiweMessage(rawMessage);
  } catch {
    return { ok: false, reason: 'invalid_message' };
  }

  // The smart-account check runs on Base, so the message must be for Base: a
  // message signed for another chain would be validated against the wrong state.
  if (message.chainId !== base.id) return { ok: false, reason: 'wrong_chain' };

  const now = Date.now();
  if (message.expirationTime && Date.parse(message.expirationTime) <= now) return { ok: false, reason: 'expired' };
  if (message.notBefore && Date.parse(message.notBefore) > now) return { ok: false, reason: 'not_yet_valid' };

  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return { ok: false, reason: 'invalid_signature' };
  const sig = signature as Hex;
  const address = message.address as Address;

  // The wallet signed the exact string the client sent, so recover over that.
  try {
    const recovered = await recoverMessageAddress({ message: rawMessage, signature: sig });
    if (isAddressEqual(recovered, address)) return { ok: true, message };
  } catch {
    // Not a 65-byte ECDSA signature (smart-account signatures are longer): fall through.
  }

  try {
    if (await onChain({ address, message: rawMessage, signature: sig })) return { ok: true, message };
  } catch (err) {
    logger.warn({ err, address }, 'siwe: on-chain signature check failed');
  }
  return { ok: false, reason: 'invalid_signature' };
}
