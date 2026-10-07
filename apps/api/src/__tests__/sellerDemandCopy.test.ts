import { describe, expect, it } from 'vitest';
import { SELLER_DEMAND_ROUTE, x402OpenApiDocument, x402PaidRoutes } from '../lib/x402.js';

// What the paid seller check says it sees, in the places agents read before paying.
describe('seller check copy', () => {
  it('the OpenAPI description says payers behind facilitator proxies are traced and exchanges are not', () => {
    const doc = x402OpenApiDocument() as { paths: Record<string, { get: { description: string } }> };
    const text = doc.paths['/api/risk/seller-demand']!.get.description;
    expect(text).toMatch(/facilitator prox/);
    expect(text).toMatch(/Meridian/);
    expect(text).toMatch(/exchange/i);
    expect(text).not.toMatch(/—/);
  });

  it('the x402 listing says the same', () => {
    const route = x402PaidRoutes('0x' + 'f'.repeat(40))[SELLER_DEMAND_ROUTE] as unknown as { description: string };
    expect(route.description).toMatch(/facilitator prox/);
    expect(route.description).not.toMatch(/—/);
  });
});
