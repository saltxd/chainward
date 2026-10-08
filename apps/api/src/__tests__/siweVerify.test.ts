import { describe, expect, it, vi } from 'vitest';
import { SiweMessage } from 'siwe';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { verifySiwe } from '../lib/siweVerify.js';

// Sign-in must accept the signatures Base users actually produce. An EOA signs
// with its key (ecrecover). A smart account (Coinbase Smart Wallet, Safe) signs
// through ERC-1271, and one that is not deployed yet wraps that in ERC-6492;
// neither recovers to the account address, so they need an on-chain check.

const account = privateKeyToAccount(generatePrivateKey());

function siwe(overrides: Partial<ConstructorParameters<typeof SiweMessage>[0] & object> = {}): string {
  return new SiweMessage({
    domain: 'chainward.ai',
    address: account.address,
    statement: 'Sign in to ChainWard',
    uri: 'https://chainward.ai/login',
    version: '1',
    chainId: 8453,
    nonce: 'a1b2c3d4e5f6a7b8',
    issuedAt: new Date().toISOString(),
    ...overrides,
  }).prepareMessage();
}

const CONTRACT_SIGNATURE = `0x${'ab'.repeat(65)}` as const;

describe('verifySiwe', () => {
  it('accepts an EOA signature without touching the chain', async () => {
    const message = siwe();
    const signature = await account.signMessage({ message });
    const onChain = vi.fn(async () => false);
    const result = await verifySiwe(message, signature, onChain);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.message.address).toBe(account.address);
    expect(onChain).not.toHaveBeenCalled();
  });

  it('accepts a smart-account signature when the on-chain check (ERC-1271/6492) passes', async () => {
    const message = siwe();
    const onChain = vi.fn(async () => true);
    const result = await verifySiwe(message, CONTRACT_SIGNATURE, onChain);
    expect(result).toMatchObject({ ok: true });
    expect(onChain).toHaveBeenCalledWith({ address: account.address, message, signature: CONTRACT_SIGNATURE });
  });

  it('rejects a signature that neither recovers nor validates on-chain', async () => {
    const result = await verifySiwe(siwe(), CONTRACT_SIGNATURE, async () => false);
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects an EOA signature from a different key', async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const message = siwe();
    const signature = await other.signMessage({ message });
    const result = await verifySiwe(message, signature, async () => false);
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects an expired message before any signature work', async () => {
    const onChain = vi.fn(async () => true);
    const message = siwe({ expirationTime: new Date(Date.now() - 60_000).toISOString() });
    const result = await verifySiwe(message, CONTRACT_SIGNATURE, onChain);
    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(onChain).not.toHaveBeenCalled();
  });

  it('rejects a message that is not valid yet', async () => {
    const message = siwe({ notBefore: new Date(Date.now() + 60_000).toISOString() });
    const result = await verifySiwe(message, CONTRACT_SIGNATURE, async () => true);
    expect(result).toEqual({ ok: false, reason: 'not_yet_valid' });
  });

  it('rejects a message that does not parse', async () => {
    const result = await verifySiwe('not a siwe message', CONTRACT_SIGNATURE, async () => true);
    expect(result).toEqual({ ok: false, reason: 'invalid_message' });
  });

  it('treats an on-chain check failure (RPC down) as an invalid signature, not a crash', async () => {
    const result = await verifySiwe(siwe(), CONTRACT_SIGNATURE, async () => {
      throw new Error('rpc timeout');
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });
});
