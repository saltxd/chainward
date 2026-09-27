import type { MiddlewareHandler } from 'hono';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { logger } from './logger.js';

// ─── Pay-per-check over x402 ──────────────────────────────────────────────────
//
// GET /api/risk/x402/:address answers with a fresh (< 24h) risk report for any
// Base address, paid per request in USDC on Base. No account, no API key: the
// client retries with an x402 payment header. Settlement happens only after the
// handler succeeds, so a failed or timed-out check is never charged.

export const X402_CHECK_ROUTE = 'GET /api/risk/x402/:address';
const BASE_MAINNET = 'eip155:8453';
// PayAI settles Base-mainnet `exact` payments without an API key (free tier).
const DEFAULT_FACILITATOR = 'https://facilitator.payai.network';

export function x402CheckPrice(): string {
  return process.env.X402_CHECK_PRICE ?? '$0.05';
}

/** Payment middleware for the paid check, or null when no receiving address is configured. */
export function x402CheckMiddleware(): MiddlewareHandler | null {
  const payTo = process.env.X402_PAY_TO ?? process.env.TREASURY_WALLET_ADDRESS;
  if (!payTo) {
    logger.warn('x402: no X402_PAY_TO / TREASURY_WALLET_ADDRESS; paid check disabled');
    return null;
  }
  const facilitator = new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR });
  const server = new x402ResourceServer(facilitator).register(BASE_MAINNET, new ExactEvmScheme());

  return paymentMiddleware(
    {
      [X402_CHECK_ROUTE]: {
        accepts: {
          scheme: 'exact',
          price: x402CheckPrice(),
          network: BASE_MAINNET,
          payTo,
          maxTimeoutSeconds: 120,
        },
        serviceName: 'ChainWard counterparty check',
        description:
          'Fresh on-chain risk report for a Base address before you pay it: neutral signal band, every flag with its evidence and source, what was not assessed, and the EAS attestation if one exists. Never a safety verdict.',
        mimeType: 'application/json',
        tags: ['base', 'risk', 'counterparty', 'agents', 'eas', 'attestation'],
        unpaidResponseBody: () => ({
          contentType: 'application/json',
          body: {
            error: 'payment_required',
            price: x402CheckPrice(),
            network: 'base',
            asset: 'USDC',
            what_you_get:
              'A risk report no older than 24h (a fresh check runs if needed), JSON. Not charged if the check fails.',
            free_alternatives: {
              latest_attestation: 'GET https://api.chainward.ai/api/risk/attestation/<address>',
              web_check: 'https://chainward.ai',
            },
            docs: 'https://github.com/saltxd/chainward/blob/main/docs/ATTEST.md',
          },
        }),
      },
    },
    server,
  );
}
