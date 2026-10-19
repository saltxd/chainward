import { describe, expect, it } from 'vitest';
import { WALLET_ROUTE, X402_CHECK_ROUTES, apiHomePage, x402DiscoveryDocument, x402OpenApiDocument, x402PaidRoutes } from '../lib/x402.js';

// What the counterparty check says it returns, in the places agents and catalogs
// read before paying: the machine label, the text a buyer sees, the reason.
const LABELS = /pay \/ hold \/ unknown/;
const TEXTS = /Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden/;
const OLD = /Pay, Hold or Unknown|signal band|safety verdict|—/;

describe('counterparty check copy', () => {
  it('the OpenAPI operation names the labels, the texts and the reason', () => {
    const doc = x402OpenApiDocument() as {
      info: { description: string };
      paths: Record<string, { get: { summary: string; description: string } }>;
    };
    const op = doc.paths['/api/risk/x402']!.get;
    expect(op.summary).toMatch(LABELS);
    expect(op.description).toMatch(LABELS);
    expect(op.description).toMatch(TEXTS);
    expect(op.description).toMatch(/reason/);
    expect(op.description).toMatch(/px402 privacy pool answers Payer hidden/);
    expect(doc.info.description).toMatch(TEXTS);
    for (const text of [op.summary, op.description, doc.info.description]) expect(text).not.toMatch(OLD);
  });

  it('the discovery document and the API home page say the same', () => {
    const { description } = x402DiscoveryDocument();
    expect(description).toMatch(LABELS);
    expect(description).toMatch(TEXTS);
    expect(description).not.toMatch(OLD);
    expect(apiHomePage()).toMatch(TEXTS);
    expect(apiHomePage()).not.toMatch(/Pay, Hold or Unknown|safety verdict/);
  });

  it('the x402 listing says the same', () => {
    const route = x402PaidRoutes('0x' + 'f'.repeat(40))[X402_CHECK_ROUTES[0]] as unknown as { description: string };
    expect(route.description).toMatch(LABELS);
    expect(route.description).toMatch(TEXTS);
    expect(route.description).not.toMatch(OLD);
  });
});

// The wallet lookup's review cases, where an agent reads them before paying.
describe('wallet lookup copy', () => {
  it('the OpenAPI operation and the x402 listing name the privacy-pool review', () => {
    const op = (x402OpenApiDocument().paths as Record<string, { get: { description: string } }>)['/api/risk/wallet']!.get;
    expect(op.description).toMatch(/review if it is new, has no history, shares a funder with many wallets, or pays through the px402 privacy pool/);
    const route = x402PaidRoutes('0x' + 'f'.repeat(40))[WALLET_ROUTE] as unknown as { description: string };
    expect(route.description).toMatch(/px402 privacy pool/);
  });
});
