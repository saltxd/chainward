import type { MiddlewareHandler } from 'hono';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server';
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { logger } from './logger.js';

// ─── Pay-per-check over x402 ──────────────────────────────────────────────────
//
// GET /api/risk/x402/:address answers with a fresh (< 24h) risk report for any
// Base address, paid per request in USDC on Base. No account, no API key: the
// client retries with an x402 payment header. Settlement happens only after the
// handler succeeds, so a failed or timed-out check is never charged.

// Same check, two shapes: ?address= for generic x402 clients, /:address for REST callers.
export const X402_CHECK_ROUTES = ['GET /api/risk/x402', 'GET /api/risk/x402/:address'] as const;
const BASE_MAINNET = 'eip155:8453';
// PayAI settles Base-mainnet `exact` payments without an API key (free tier).
const DEFAULT_FACILITATOR = 'https://facilitator.payai.network';

// Trimmed from a real response, for discovery catalogs.
const OUTPUT_EXAMPLE = {
  success: true,
  data: {
    status: 'ready',
    report: {
      address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
      chain: 'base',
      band: 'high-signal',
      flags: [
        {
          id: 'stranded_value',
          severity: 'high',
          title: 'USDC balance held in a dormant wallet',
          evidence: 'Holds 5451.386272 USDC while classified dormant',
          source: 'https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
        },
      ],
      not_assessed: ['Contract bytecode or source auditing', 'Social-engineering or off-chain reputation'],
      freshness: { as_of_block: 51846337, generated_at: '2026-09-27T04:07:05.375Z', ttl_state: 'fresh' },
      attestation: {
        uid: '0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
        explorer_url:
          'https://base.easscan.org/attestation/view/0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
      },
      disclaimer:
        'Risk flags from on-chain behavior only. ChainWard cannot see social engineering, off-chain agreements, or intent. Absence of flags is not a guarantee of safety.',
    },
  },
};

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
  const server = new x402ResourceServer(facilitator)
    .register(BASE_MAINNET, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);

  const example = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
  const addressSchema = {
    type: 'object',
    properties: {
      address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'Base address to check' },
    },
    required: ['address'],
  };
  const route = (discovery: ReturnType<typeof declareDiscoveryExtension>): RouteConfig => ({
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
    // Bazaar discovery: facilitators catalog the endpoint from this after a settled payment.
    extensions: discovery,
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
  });

  return paymentMiddleware(
    {
      [X402_CHECK_ROUTES[0]]: route(
        declareDiscoveryExtension({
          input: { address: example },
          inputSchema: addressSchema,
          output: { example: OUTPUT_EXAMPLE },
        }),
      ),
      [X402_CHECK_ROUTES[1]]: route(
        declareDiscoveryExtension({
          pathParams: { address: example },
          pathParamsSchema: addressSchema,
          output: { example: OUTPUT_EXAMPLE },
        }),
      ),
    },
    server,
  );
}
