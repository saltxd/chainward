/**
 * Buying one paid check from the browser: the x402 v2 `exact` scheme on Base,
 * signed as an EIP-3009 TransferWithAuthorization for USDC. Same wire format as
 * @x402/fetch + @x402/evm (examples/pay-per-check), without the SDK in the web
 * bundle. The facilitator submits the transfer and pays the gas; the API settles
 * only after the check succeeds.
 */
import { getAddress } from 'viem';
import { PAID_API_ORIGIN } from './paidChecks';

export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const BASE_NETWORK = 'eip155:8453';
const BASE_CHAIN_ID = 8453;

type Hex = `0x${string}`;

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: { url: string; description?: string; mimeType?: string; [key: string]: unknown };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export interface TransferTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
  types: typeof AUTHORIZATION_TYPES;
  primaryType: 'TransferWithAuthorization';
  message: { from: Hex; to: Hex; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };
}

/** The connected wallet, as far as paying needs it. */
export interface PaySigner {
  address: Hex;
  signTypedData: (typedData: TransferTypedData) => Promise<Hex>;
}

export type PayOutcome =
  | { kind: 'paid'; data: unknown; transaction: string | null }
  /** The API answered the signed payment with another 402 (e.g. not enough USDC). */
  | { kind: 'refused'; message: string }
  /** The check failed or was refused before payment; nothing settles. */
  | { kind: 'failed'; status: number; message: string }
  /** The wallet declined to sign; nothing was sent. */
  | { kind: 'cancelled' };

export interface PayDeps {
  signer: PaySigner;
  /** Never sign for more than this (atomic USDC): the price the reader was shown. */
  maxAtomic: bigint;
  fetchImpl?: typeof fetch;
  now?: () => number;
  nonce?: () => Hex;
}

function encodeBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Json<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function parsePaymentRequired(header: string | null): PaymentRequired | null {
  const parsed = decodeBase64Json<PaymentRequired>(header);
  return parsed && Array.isArray(parsed.accepts) ? parsed : null;
}

/** The one option this client can pay: exact, USDC on Base, EIP-3009 (not Permit2). */
export function selectRequirement(required: PaymentRequired): PaymentRequirements | null {
  return (
    required.accepts.find(
      (r) =>
        r.scheme === 'exact' &&
        r.network === BASE_NETWORK &&
        r.asset.toLowerCase() === BASE_USDC.toLowerCase() &&
        typeof r.extra?.name === 'string' &&
        typeof r.extra?.version === 'string' &&
        (r.extra.assetTransferMethod ?? 'eip3009') === 'eip3009',
    ) ?? null
  );
}

/** What a facilitator's refusal code means for the reader. */
export function refusalMessage(error: string | undefined): string {
  if (!error) return 'Payment refused.';
  if (/insufficient/i.test(error)) return 'Not enough USDC on Base in this wallet.';
  const code = error.split(':')[0].trim();
  if (/valid_before|valid_after|expired/i.test(code)) return 'The signed payment expired before it was checked. Try again.';
  if (/nonce/i.test(code)) return 'That payment was already used. Try again.';
  if (/signature/i.test(code)) return 'The wallet signature did not verify.';
  return `Payment refused: ${code.replace(/_/g, ' ')}.`;
}

const usdc = (atomic: bigint) => (Number(atomic) / 1e6).toFixed(2);

async function apiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    const message = typeof body.error === 'object' ? body.error?.message : (body.message ?? body.error);
    if (message) return message;
  } catch {
    // not JSON
  }
  return `The API answered ${res.status}.`;
}

function isUserRejection(err: unknown): boolean {
  const e = err as { name?: string; code?: number; message?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.name === 'UserRejectedRequestError' || e.code === 4001) return true;
  if (/user (rejected|denied)/i.test(e.message ?? '')) return true;
  return e.cause ? isUserRejection(e.cause) : false;
}

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * One paid request: read the 402 challenge, sign it once, send it once. Never
 * retries a signed payment, so one call is at most one charge.
 */
export async function payForCheck(resource: string, deps: PayDeps): Promise<PayOutcome> {
  if (!resource.startsWith(`${PAID_API_ORIGIN}/`)) {
    throw new Error(`Paid checks go to ${PAID_API_ORIGIN} directly, not ${resource}`);
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const init: RequestInit = { method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } };

  const challenge = await fetchImpl(resource, init);
  if (challenge.status !== 402) {
    if (challenge.ok) return { kind: 'paid', data: ((await challenge.json()) as { data?: unknown }).data, transaction: null };
    return { kind: 'failed', status: challenge.status, message: await apiError(challenge) };
  }

  const required = parsePaymentRequired(challenge.headers.get('payment-required'));
  const requirement = required && selectRequirement(required);
  if (!required || !requirement) {
    return { kind: 'failed', status: 402, message: 'Could not read a USDC on Base payment request from the API. Nothing was signed.' };
  }
  const amount = BigInt(requirement.amount);
  if (amount > deps.maxAtomic) {
    return {
      kind: 'failed',
      status: 402,
      message: `The API asked for ${usdc(amount)} USDC, more than the ${usdc(deps.maxAtomic)} USDC shown. Nothing was signed.`,
    };
  }

  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  const authorization = {
    from: getAddress(deps.signer.address),
    to: getAddress(requirement.payTo),
    value: requirement.amount,
    validAfter: '0',
    validBefore: String(now + requirement.maxTimeoutSeconds),
    nonce: (deps.nonce ?? randomNonce)(),
  };

  let signature: Hex;
  try {
    signature = await deps.signer.signTypedData({
      domain: {
        name: requirement.extra!.name as string,
        version: requirement.extra!.version as string,
        chainId: BASE_CHAIN_ID,
        verifyingContract: getAddress(requirement.asset),
      },
      types: AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from,
        to: authorization.to,
        value: amount,
        validAfter: 0n,
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });
  } catch (err) {
    if (isUserRejection(err)) return { kind: 'cancelled' };
    throw err;
  }

  const payment = encodeBase64Json({
    x402Version: required.x402Version,
    resource: required.resource,
    accepted: requirement,
    payload: { authorization, signature },
    extensions: required.extensions,
  });
  const paid = await fetchImpl(resource, {
    ...init,
    headers: { Accept: 'application/json', 'PAYMENT-SIGNATURE': payment },
  });

  if (paid.status === 402) {
    return { kind: 'refused', message: refusalMessage(parsePaymentRequired(paid.headers.get('payment-required'))?.error) };
  }
  if (!paid.ok) return { kind: 'failed', status: paid.status, message: await apiError(paid) };
  const body = (await paid.json()) as { data?: unknown };
  const receipt = decodeBase64Json<{ transaction?: string }>(paid.headers.get('payment-response'));
  return { kind: 'paid', data: body.data, transaction: receipt?.transaction ?? null };
}
