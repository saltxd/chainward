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
// Seller demand: where a seller's buyers get their USDC (services/sellerDemandService.ts).
export const SELLER_DEMAND_ROUTE = 'GET /api/risk/seller-demand' as const;
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

export function x402SellerPrice(): string {
  return process.env.X402_SELLER_PRICE ?? '$0.10';
}

// Paid datasets (routes/paid.ts). One price for every file; must match paid_files.price_usdc.
export const PAID_FILE_ROUTE = 'GET /api/paid/:slug/file' as const;
export function x402FilePrice(): string {
  return process.env.X402_FILE_PRICE ?? '$10';
}

// The #2 seller from chainward.ai/decodes/x402-on-base, as the check reported it.
const SELLER_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    address: '0x68396bd35874695ad86cd29410bd80a550991a2b',
    window_days: 30,
    sample: { inflow_transfers: 1000, buyers: 500, capped: true },
    via_intermediary_share: 0,
    top_buyer_share: 0.037,
    buyers_checked: 30,
    seller_funded: { buyers: 30, volume_share: 1, hops: { '3': 30 } },
    paid_back_share: 0,
    common_first_funder: { address: '0x82b551e820efc3503a3a27fc450e07e328daf91c', buyer_share: 0.5 },
    walk_stops: {},
    signals: [
      {
        id: 'buyers_funded_by_seller',
        title: "Most checked buyers' USDC traces back to this address",
        evidence: '30 of 30 top buyers reach this address within 3 hops of their largest funders (100% of their volume).',
      },
      {
        id: 'common_funder',
        title: 'One wallet funds most checked buyers',
        evidence: '0x82b551e820efc3503a3a27fc450e07e328daf91c is the largest funder of 50% of the top buyers checked.',
      },
    ],
    disclaimer:
      'Describes where USDC moved on Base, not why. A common funder can be a legitimate faucet, exchange or custodian. Not a safety verdict.',
  },
};

/**
 * /.well-known/x402 discovery document. `version` is what indexers such as
 * x402scan read today; `x402Version` is the draft discovery spec's field. Each
 * resource's 402 challenge stays authoritative for price and payTo.
 */
export function x402DiscoveryDocument() {
  return {
    version: 1,
    x402Version: 2,
    name: 'ChainWard',
    description:
      'On-chain risk reports for Base addresses: check a counterparty before you pay it. Never a safety verdict.',
    contact: 'https://chainward.ai',
    resources: ['https://api.chainward.ai/api/risk/x402', 'https://api.chainward.ai/api/risk/seller-demand'],
    docs: 'https://github.com/saltxd/chainward/blob/main/docs/ATTEST.md',
  };
}

/**
 * /openapi.json — what x402 indexers (x402scan via @agentcash/discovery) read
 * first. Lists only the paid operation; its 402 challenge stays authoritative.
 */
export function x402OpenApiDocument() {
  const usd = (x402CheckPrice().match(/[\d.]+/) ?? ['0.05'])[0];
  const sellerUsd = (x402SellerPrice().match(/[\d.]+/) ?? ['0.10'])[0];
  return {
    openapi: '3.1.0',
    info: {
      title: 'ChainWard',
      version: '1.0.0',
      description:
        'On-chain risk reports for Base addresses: check a counterparty before you pay it. Never a safety verdict.',
      contact: { url: 'https://chainward.ai' },
    },
    servers: [{ url: 'https://api.chainward.ai' }],
    paths: {
      '/api/risk/x402': {
        get: {
          operationId: 'counterpartyCheck',
          summary: 'Fresh risk report for a Base or BNB Chain address, paid per call over x402',
          description:
            'Returns a report no older than 24h, running a fresh check when needed: neutral signal band, every flag with its evidence and source, what was not assessed, and the EAS attestation if one exists. Not charged if the check fails.',
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
              description: 'Address to check',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['base', 'bsc'], default: 'base' },
              description: 'Chain the address is on. Payment is USDC on Base either way.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: usd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': {
              description: 'Report (status "ready") or status "no_history"',
              content: { 'application/json': { example: OUTPUT_EXAMPLE } },
            },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '504': { description: 'Check did not finish in time; not charged' },
          },
        },
      },
      '/api/risk/seller-demand': {
        get: {
          operationId: 'sellerDemandCheck',
          summary: "Where an x402 seller's buyers get their USDC, paid per call over x402",
          description:
            "For any Base address that receives payments: samples its recent USDC inflows, walks each top buyer's funding back up to 4 hops, and reports how much traces to the seller itself, how much it pays back, and whether one wallet funds most buyers. Not charged if the check fails.",
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
              description: 'Base address that receives payments (an x402 payTo)',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: sellerUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Seller demand report', content: { 'application/json': { example: SELLER_OUTPUT_EXAMPLE } } },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '504': { description: 'Check did not finish in time; not charged' },
          },
        },
      },
    },
  };
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
  interface Product {
    price: string;
    serviceName: string;
    description: string;
    tags: string[];
    whatYouGet: string;
  }
  const counterparty: Product = {
    price: x402CheckPrice(),
    serviceName: 'ChainWard counterparty check',
    description:
      'Fresh on-chain risk report for a Base or BNB Chain (?chain=bsc) address before you pay it: neutral signal band, every flag with its evidence and source, what was not assessed, and the EAS attestation if one exists. Never a safety verdict.',
    tags: ['base', 'risk', 'counterparty', 'agents', 'eas', 'attestation'],
    whatYouGet:
      'A risk report no older than 24h (a fresh check runs if needed), JSON. Base by default; add ?chain=bsc for a BNB Chain address. Not charged if the check fails.',
  };
  const sellerDemand: Product = {
    price: x402SellerPrice(),
    serviceName: 'ChainWard x402 seller check',
    description:
      "Where an x402 seller's buyers get their USDC: how much of its top buyers' money traces back to the seller, how much it pays back, and whether one wallet funds most buyers. Describes money flows, never intent.",
    tags: ['base', 'x402', 'seller', 'demand', 'wash', 'counterparty', 'agents'],
    whatYouGet:
      "A seller demand report for the last 30 days (top 30 buyers' funding walked back up to 4 hops), JSON. Not charged if the check fails.",
  };
  const paidFile: Product = {
    price: x402FilePrice(),
    serviceName: 'ChainWard dataset',
    description:
      'The full dataset behind a published ChainWard decode (e.g. every wallet in an incentive-farming audit, tiered, with the transactions behind each one). CSV.',
    tags: ['base', 'dataset', 'sybil', 'airdrop', 'points', 'agents'],
    whatYouGet: 'The CSV named by the slug (see GET /api/paid for what is available). Not charged if the file does not exist.',
  };
  const route = (product: Product, discovery: ReturnType<typeof declareDiscoveryExtension>): RouteConfig => ({
    accepts: {
      scheme: 'exact',
      price: product.price,
      network: BASE_MAINNET,
      payTo,
      maxTimeoutSeconds: 120,
    },
    serviceName: product.serviceName,
    description: product.description,
    mimeType: 'application/json',
    tags: product.tags,
    // Bazaar discovery: facilitators catalog the endpoint from this after a settled payment.
    extensions: discovery,
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: {
        error: 'payment_required',
        price: product.price,
        network: 'base',
        asset: 'USDC',
        what_you_get: product.whatYouGet,
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
      [X402_CHECK_ROUTES[0]]: {
        ...route(
          counterparty,
          declareDiscoveryExtension({
            input: { address: example },
            inputSchema: addressSchema,
            output: { example: OUTPUT_EXAMPLE },
          }),
        ),
        // TLS ends at the proxy, so the request URL reads http://; catalogs key on this.
        resource: 'https://api.chainward.ai/api/risk/x402',
      },
      [X402_CHECK_ROUTES[1]]: route(
        counterparty,
        declareDiscoveryExtension({
          pathParams: { address: example },
          pathParamsSchema: addressSchema,
          output: { example: OUTPUT_EXAMPLE },
        }),
      ),
      [PAID_FILE_ROUTE]: route(
        paidFile,
        declareDiscoveryExtension({
          pathParams: { slug: 'termix-wallets' },
          pathParamsSchema: {
            type: 'object',
            properties: { slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,59}$', description: 'File slug from GET /api/paid' } },
            required: ['slug'],
          },
          output: { example: { contentType: 'text/csv' } },
        }),
      ),
      [SELLER_DEMAND_ROUTE]: {
        ...route(
          sellerDemand,
          declareDiscoveryExtension({
            input: { address: '0x68396bd35874695ad86cd29410bd80a550991a2b' },
            inputSchema: addressSchema,
            output: { example: SELLER_OUTPUT_EXAMPLE },
          }),
        ),
        resource: 'https://api.chainward.ai/api/risk/seller-demand',
      },
    },
    server,
  );
}
