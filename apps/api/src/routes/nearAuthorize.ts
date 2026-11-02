import { randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isPlaceholderAddress } from '@chainward/common';
import { CLASSIFIER_VERSION, counterpartyVerdict, withListFlags, type CounterpartyVerdictLabel, type RiskAssessment, type Verdict } from '@chainward/decode';
import { AppError } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { logger } from '../lib/logger.js';
import { sanctionsAnswer } from '../lib/sanctionsCheck.js';
import { U128_MAX, U64_MAX, toHex } from '../lib/near/canonical.js';
import { signAuth, type SignerKeyPair } from '../lib/near/sign.js';
import { fitReason, verdictSigner } from '../lib/near/signer.js';
import type { Chain, PaymentAuth, ValidationFailure } from '../lib/near/types.js';
import { validate } from '../lib/near/validate.js';
import { runCounterpartyCheck, spendFreeDecode, type ReportPayload } from './risk.js';

// ─── NEAR payment guard: the signed verdict ───────────────────────────────────
//
// POST /api/near/authorize is what an agent calls before asking a NEAR payment guard
// (saltxd/near-payment-guard) to pay. It runs the sanctions list and the counterparty
// check (whose report carries the decoy step and the public labels) on the destination,
// and signs Pay / Hold / Unknown with ed25519 over the guard's canonical bytes. The agent
// passes `auth` and `signature` to the guard's request_payment unchanged; the guard pays
// only a signed Pay, and refuses a Hold or Unknown with its signed reason.
//
// Free and not listed or priced anywhere. The key comes only from NEAR_VERDICT_SIGNING_KEY
// (a k8s secret); unset, both routes answer 503 NOT_CONFIGURED and nothing is signed.

/** Decimal digits: one more than u128 needs, so an overflow is a range error, not a format one. */
const DECIMAL = /^[0-9]{1,40}$/;

const authorizeBody = z.object({
  guard_id: z.string(),
  deposit_address: z.string(),
  destination: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chain: z.enum(['base', 'bsc']),
  amount: z.string().regex(DECIMAL),
  quote_expiry: z.union([z.number().int().nonnegative(), z.string().regex(DECIMAL)]),
  nonce: z.string().regex(DECIMAL).optional(),
});

const HINTS: Record<string, string> = {
  guard_id: 'guard_id must be the NEAR account id of the guard contract that will pay',
  deposit_address: "deposit_address must be the 1Click quote's depositAddress: 1 to 128 printable ASCII characters, no spaces",
  destination: "destination must be the 0x EVM address the money surfaces at (the quote's recipient)",
  chain: 'chain must be base or bsc',
  amount: "amount must be a decimal string in the asset's smallest unit (the quote's amountIn), from 1 to 2^128-1",
  quote_expiry: 'quote_expiry must be the quote deadline in unix seconds',
  nonce: 'nonce, when given, must be a decimal string from 0 to 2^128-1; leave it out and one is picked at random',
};

const FAILURE_FIELD: Partial<Record<ValidationFailure, string>> = {
  guard_id_invalid: 'guard_id',
  deposit_address_invalid: 'deposit_address',
  destination_invalid: 'destination',
  chain_invalid: 'chain',
};

const GENERIC = 'Send a JSON object with guard_id, deposit_address, destination, chain, amount and quote_expiry (and optionally nonce)';

/** The empty assessment the list matches are applied to, for an answer that needs no chain read. */
const noFlags = (): RiskAssessment => ({ band: 'low-signal', flags: [], not_assessed: [], classifier_version: CLASSIFIER_VERSION, signal_density: 0 });

interface AuthorizeInput {
  guardId: string;
  depositAddress: string;
  destination: string;
  chain: Chain;
  amount: bigint;
  quoteExpiry: bigint;
  nonce: bigint;
}

type DecoyStatus = 'raised' | 'not_raised' | 'not_assessed' | 'not_applicable' | 'not_run';

interface Assessment {
  verdict: Verdict<CounterpartyVerdictLabel>;
  checks: {
    sanctions: { listed: boolean };
    counterparty: { status: 'ready' | 'no_history' | 'not_run'; label?: CounterpartyVerdictLabel; text?: string };
    decoy: { status: DecoyStatus };
  };
}

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

const badRequest = (field: string, details?: unknown) => new AppError(400, 'INVALID_REQUEST', HINTS[field] ?? GENERIC, details);

function requireSigner(): SignerKeyPair {
  const signer = verdictSigner();
  if (!signer) {
    throw new AppError(503, 'NOT_CONFIGURED', 'NEAR verdict signing is not configured on this deployment.');
  }
  return signer;
}

/** The guard refuses an expired quote, so a verdict for one is refused here, before and after the checks. */
function assertQuoteLive(quoteExpiry: bigint, nowSec: bigint): void {
  if (quoteExpiry <= nowSec) {
    throw new AppError(400, 'QUOTE_EXPIRED', 'quote_expiry has passed. Get a fresh 1Click quote, then ask again.');
  }
}

function parseAuthorizeInput(body: unknown, nowSec: bigint): AuthorizeInput {
  const parsed = authorizeBody.safeParse(body);
  if (!parsed.success) throw badRequest(String(parsed.error.issues[0]?.path[0] ?? ''));
  const b = parsed.data;

  const destination = b.destination.toLowerCase();
  if (isPlaceholderAddress(destination)) {
    throw new AppError(400, 'INVALID_REQUEST', 'destination is a placeholder address (0x000…), not a wallet to pay');
  }
  const amount = BigInt(b.amount);
  if (amount < 1n || amount > U128_MAX) throw badRequest('amount');
  const quoteExpiry = BigInt(b.quote_expiry);
  if (quoteExpiry > U64_MAX) throw badRequest('quote_expiry');
  assertQuoteLive(quoteExpiry, nowSec);
  const nonce = b.nonce === undefined ? BigInt(`0x${randomBytes(16).toString('hex')}`) : BigInt(b.nonce);
  if (nonce > U128_MAX) throw badRequest('nonce');

  const input: AuthorizeInput = { guardId: b.guard_id, depositAddress: b.deposit_address, destination, chain: b.chain, amount, quoteExpiry, nonce };
  // The guard's own shape rules, so nothing is signed that the contract must refuse.
  const failure = validate({ ...input, verdict: 'unknown', reason: '', issuedAt: nowSec });
  if (failure) throw badRequest(FAILURE_FIELD[failure] ?? '', { failure });
  return input;
}

/** The decoy step's outcome, from the report's flags and coverage block. */
function decoyStatus(report: ReportPayload): DecoyStatus {
  if (report.flags.some((f) => f.id === 'poisoning_decoy')) return 'raised';
  return report.coverage?.checks.find((check) => check.id === 'poisoning_decoy')?.status ?? 'not_applicable';
}

/**
 * Sanctions first: a listed address is Hold from the list alone, worded as the
 * counterparty check words it, with no chain read. Then the counterparty check itself,
 * the same one sold over x402, from a fresh report or a decode run now. A decode spends
 * the caller's free decode allowance, the one the free risk check uses.
 */
async function assess(c: Context, destination: string, chain: Chain): Promise<Assessment> {
  if (sanctionsAnswer(destination).sanctioned) {
    return {
      verdict: counterpartyVerdict(withListFlags(noFlags(), destination, chain), null),
      checks: { sanctions: { listed: true }, counterparty: { status: 'not_run' }, decoy: { status: 'not_run' } },
    };
  }
  const answer = await runCounterpartyCheck(destination, chain, { beforeDecode: () => spendFreeDecode(c) });
  if (answer.status === 'no_history') {
    const { label, text } = answer.verdict;
    // Nothing ever reached the address, so nothing was planted in its history either.
    return { verdict: answer.verdict, checks: { sanctions: { listed: false }, counterparty: { status: 'no_history', label, text }, decoy: { status: 'not_applicable' } } };
  }
  const { verdict } = answer.report;
  return {
    verdict,
    checks: {
      sanctions: { listed: false },
      counterparty: { status: 'ready', label: verdict.label, text: verdict.text },
      decoy: { status: decoyStatus(answer.report) },
    },
  };
}

/** The guard's PaymentAuthArgs JSON: snake_case, integers as decimal strings (U128 / U64). */
function authArgs(auth: PaymentAuth) {
  return {
    guard_id: auth.guardId,
    deposit_address: auth.depositAddress,
    destination: auth.destination,
    chain: auth.chain,
    amount: auth.amount.toString(),
    verdict: auth.verdict,
    reason: auth.reason,
    issued_at: auth.issuedAt.toString(),
    quote_expiry: auth.quoteExpiry.toString(),
    nonce: auth.nonce.toString(),
  };
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const nearAuthorize = new Hono();

// POST /api/near/authorize — a signed verdict for one payment a guard is about to make.
nearAuthorize.post('/authorize', rateLimit({ max: 30, windowSec: 60, prefix: 'rl:near-authorize' }), async (c) => {
  const signer = requireSigner();
  const input = parseAuthorizeInput(await c.req.json().catch(() => undefined), nowSeconds());
  const { verdict, checks } = await assess(c, input.destination, input.chain);

  // Stamped after the checks, which can take most of a minute when a decode runs.
  const issuedAt = nowSeconds();
  assertQuoteLive(input.quoteExpiry, issuedAt);
  const auth: PaymentAuth = { ...input, verdict: verdict.label, reason: fitReason(verdict.reason), issuedAt };
  const signature = signAuth(auth, signer.privateKey);
  logger.info(
    { guardId: auth.guardId, destination: auth.destination, chain: auth.chain, verdict: auth.verdict, nonce: auth.nonce.toString() },
    'near authorize: verdict signed',
  );
  return c.json({
    success: true,
    data: {
      auth: authArgs(auth),
      signature: base64(signature),
      public_key: base64(signer.publicKeyBytes),
      verdict,
      checks,
    },
  });
});

// GET /api/near/public-key — the key to register with the guard's set_chainward_pubkey.
nearAuthorize.get('/public-key', (c) => {
  const { publicKeyBytes } = requireSigner();
  return c.json({ success: true, data: { public_key: base64(publicKeyBytes), public_key_hex: toHex(publicKeyBytes) } });
});

export { nearAuthorize };
