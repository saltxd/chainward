import { describe, expect, it } from 'vitest';
import { x402OpenApiDocument } from '../lib/x402.js';

// x402scan reads /openapi.json and probes each path for a 402. A templated
// path ({slug}) can't be probed, so every published dataset also gets its own
// concrete path with the same payment info.

describe('OpenAPI dataset paths', () => {
  const doc = x402OpenApiDocument() as {
    paths: Record<string, { get: { operationId: string; 'x-payment-info': { price: { amount: string } } } }>;
  };

  it.each(['termix-wallets', 'set-and-earn-week-one'])('lists /api/paid/%s/file as its own paid path', (slug) => {
    const p = doc.paths[`/api/paid/${slug}/file`];
    expect(p).toBeDefined();
    expect(p!.get['x-payment-info'].price.amount).toBe('10');
  });

  it('gives each concrete dataset path a distinct operationId', () => {
    const ids = Object.values(doc.paths).map((p) => p.get.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('OpenAPI counterparty check', () => {
  it('tells buyers it screens the US sanctions list and that a match answers Hold', () => {
    const doc = x402OpenApiDocument() as { paths: Record<string, { get: { description: string } }> };
    expect(doc.paths['/api/risk/x402']!.get.description).toMatch(/OFAC/);
    expect(doc.paths['/api/risk/x402']!.get.description).toMatch(/Hold/);
  });
});
