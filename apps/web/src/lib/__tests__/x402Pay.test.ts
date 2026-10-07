import { describe, expect, it, vi } from 'vitest';
import {
  BASE_USDC,
  payForCheck,
  parsePaymentRequired,
  refusalMessage,
  selectRequirement,
  type PaymentRequired,
  type PaySigner,
} from '../x402Pay';

// The challenge api.chainward.ai sent for the seller check on 2026-10-06 (bazaar
// extension trimmed), so the client is tested against what the server really says.
const PAY_TO = '0xf7Ee65130Fb2B3bb42Cc5cbFED085d7D482667cD';
const RESOURCE = 'https://api.chainward.ai/api/risk/seller-demand?address=0x68396bd35874695ad86cd29410bd80a550991a2b';
const CHALLENGE: PaymentRequired = {
  x402Version: 2,
  error: 'Payment required',
  resource: {
    url: 'https://api.chainward.ai/api/risk/seller-demand',
    description: "Where a seller's buyers get their stablecoins.",
    mimeType: 'application/json',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '100000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: PAY_TO,
      maxTimeoutSeconds: 120,
      extra: { name: 'USD Coin', version: '2' },
    },
  ],
  extensions: { bazaar: { info: { input: { type: 'http', method: 'GET' } } } },
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const unb64 = (value: string) => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));

const BUYER = '0x1111111111111111111111111111111111111111' as const;
const SIGNATURE = `0x${'ab'.repeat(65)}` as const;
const NONCE = `0x${'07'.repeat(32)}` as const;
const NOW = 1_791_340_000;

function challengeResponse(body: PaymentRequired = CHALLENGE): Response {
  return new Response(JSON.stringify({ error: 'payment_required' }), {
    status: 402,
    headers: { 'content-type': 'application/json', 'payment-required': b64(body) },
  });
}

function signer(impl?: PaySigner['signTypedData']): PaySigner & { signTypedData: ReturnType<typeof vi.fn> } {
  return { address: BUYER, signTypedData: vi.fn(impl ?? (async () => SIGNATURE)) };
}

const deps = (fetchImpl: typeof fetch, s: PaySigner) => ({
  fetchImpl,
  signer: s,
  maxAtomic: 100_000n,
  now: () => NOW,
  nonce: () => NONCE,
});

describe('parsePaymentRequired', () => {
  it('decodes the base64 PAYMENT-REQUIRED header', () => {
    expect(parsePaymentRequired(b64(CHALLENGE))).toEqual(CHALLENGE);
  });

  it('keeps non-ASCII text intact', () => {
    const withUnicode = { ...CHALLENGE, error: 'Zahlung erforderlich: ü' };
    expect(parsePaymentRequired(b64(withUnicode))?.error).toBe('Zahlung erforderlich: ü');
  });

  it('answers null for a missing or garbled header', () => {
    expect(parsePaymentRequired(null)).toBeNull();
    expect(parsePaymentRequired('not base64 json!')).toBeNull();
  });
});

describe('selectRequirement', () => {
  it('picks the exact USDC on Base option', () => {
    expect(selectRequirement(CHALLENGE)).toEqual(CHALLENGE.accepts[0]);
  });

  it('ignores options it cannot sign: another network, another asset, Permit2', () => {
    const [req] = CHALLENGE.accepts;
    expect(selectRequirement({ ...CHALLENGE, accepts: [{ ...req, network: 'eip155:1' }] })).toBeNull();
    expect(selectRequirement({ ...CHALLENGE, accepts: [{ ...req, asset: '0x0000000000000000000000000000000000000001' }] })).toBeNull();
    expect(
      selectRequirement({ ...CHALLENGE, accepts: [{ ...req, extra: { ...req.extra, assetTransferMethod: 'permit2' } }] }),
    ).toBeNull();
    expect(selectRequirement({ ...CHALLENGE, accepts: [{ ...req, extra: {} }] })).toBeNull();
  });
});

describe('refusalMessage', () => {
  it.each(['insufficient_funds', 'invalid_exact_evm_insufficient_balance', 'insufficient_funds: balance 0 < 100000'])(
    '%s reads as not enough USDC',
    (code) => {
      expect(refusalMessage(code)).toBe('Not enough USDC on Base in this wallet.');
    },
  );

  it('explains an expired authorization', () => {
    expect(refusalMessage('invalid_exact_evm_payload_authorization_valid_before')).toMatch(/expired/i);
  });

  it('falls back to the code itself, readable', () => {
    expect(refusalMessage('something_new_happened')).toBe('Payment refused: something new happened.');
    expect(refusalMessage(undefined)).toBe('Payment refused.');
  });
});

describe('payForCheck', () => {
  it('signs one EIP-3009 transfer for the challenge and retries with PAYMENT-SIGNATURE', async () => {
    const data = { address: '0x68396bd35874695ad86cd29410bd80a550991a2b', signals: [] };
    const receipt = { success: true, transaction: `0x${'cd'.repeat(32)}`, network: 'eip155:8453', payer: BUYER };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(Response.json({ success: true, data }, { headers: { 'payment-response': b64(receipt) } }));
    const s = signer();

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome).toEqual({ kind: 'paid', data, transaction: receipt.transaction });
    expect(s.signTypedData).toHaveBeenCalledTimes(1);
    expect(s.signTypedData.mock.calls[0][0]).toEqual({
      domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: BASE_USDC },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: { from: BUYER, to: PAY_TO, value: 100_000n, validAfter: 0n, validBefore: BigInt(NOW + 120), nonce: NONCE },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0];
    expect(firstUrl).toBe(RESOURCE);
    expect(firstInit?.credentials).toBe('omit');
    const [secondUrl, secondInit] = fetchImpl.mock.calls[1];
    expect(secondUrl).toBe(RESOURCE);
    const header = new Headers(secondInit?.headers).get('payment-signature');
    expect(unb64(header!)).toEqual({
      x402Version: 2,
      resource: CHALLENGE.resource,
      accepted: CHALLENGE.accepts[0],
      payload: {
        authorization: {
          from: BUYER,
          to: PAY_TO,
          value: '100000',
          validAfter: '0',
          validBefore: String(NOW + 120),
          nonce: NONCE,
        },
        signature: SIGNATURE,
      },
      extensions: CHALLENGE.extensions,
    });
  });

  it('reports a refused payment from the second 402 and never signs twice', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(challengeResponse({ ...CHALLENGE, error: 'insufficient_funds' }));
    const s = signer();

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome).toEqual({ kind: 'refused', message: 'Not enough USDC on Base in this wallet.' });
    expect(s.signTypedData).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('passes on the API error when the paid check fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(
        Response.json(
          { success: false, error: { code: 'CHECK_TIMEOUT', message: 'The check did not finish in time. You were not charged; retry shortly.' } },
          { status: 504 },
        ),
      );

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, signer()));

    expect(outcome).toEqual({
      kind: 'failed',
      status: 504,
      message: 'The check did not finish in time. You were not charged; retry shortly.',
    });
  });

  it('does not sign when the first request is refused (bad input)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ success: false, error: { code: 'INVALID_ADDRESS', message: 'Not an address' } }, { status: 400 }),
      );
    const s = signer();

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome).toEqual({ kind: 'failed', status: 400, message: 'Not an address' });
    expect(s.signTypedData).not.toHaveBeenCalled();
  });

  it('does not sign for more than the price shown', async () => {
    const pricier = { ...CHALLENGE, accepts: [{ ...CHALLENGE.accepts[0], amount: '200000' }] };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(challengeResponse(pricier));
    const s = signer();

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' && outcome.message).toMatch(/0\.20 USDC/);
    expect(s.signTypedData).not.toHaveBeenCalled();
  });

  it('does not sign when the challenge cannot be read', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 402 }));
    const s = signer();

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome.kind).toBe('failed');
    expect(s.signTypedData).not.toHaveBeenCalled();
  });

  it('only pays api.chainward.ai, never the chainward.ai proxy', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      payForCheck('https://chainward.ai/api/risk/seller-demand?address=0x68396bd35874695ad86cd29410bd80a550991a2b', deps(fetchImpl, signer())),
    ).rejects.toThrow(/api\.chainward\.ai/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a rejected signature as cancelled, with nothing sent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(challengeResponse());
    const rejected = Object.assign(new Error('User rejected the request.'), { name: 'UserRejectedRequestError', code: 4001 });
    const s = signer(async () => {
      throw rejected;
    });

    const outcome = await payForCheck(RESOURCE, deps(fetchImpl, s));

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
