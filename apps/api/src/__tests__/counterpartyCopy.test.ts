import { describe, expect, it } from 'vitest';
import { X402_CHECK_ROUTES, apiHomePage, x402DiscoveryDocument, x402OpenApiDocument, x402PaidRoutes } from '../lib/x402.js';

// What the counterparty check says it returns, in the places agents and catalogs
// read before paying: the machine label, the text a buyer sees, the reason.
const LABELS = /pay \/ hold \/ unknown/;
const TEXTS = /Pay, Hold, Inactive, No track record or Couldn't check/;
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
    for (const text of [op.summary, op.description, doc.info.description]) expect(text).not.toMatch(OLD);
  });

  it('the discovery document and the API home page say the same', () => {
    const { description } = x402DiscoveryDocument();
    expect(description).toMatch(LABELS);
    expect(description).toMatch(TEXTS);
    expect(description).not.toMatch(OLD);
    expect(apiHomePage()).not.toMatch(/Pay, Hold or Unknown|safety verdict/);
  });

  it('the x402 listing says the same', () => {
    const route = x402PaidRoutes('0x' + 'f'.repeat(40))[X402_CHECK_ROUTES[0]] as unknown as { description: string };
    expect(route.description).toMatch(LABELS);
    expect(route.description).toMatch(TEXTS);
    expect(route.description).not.toMatch(OLD);
  });
});
