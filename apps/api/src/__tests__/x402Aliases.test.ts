import { describe, expect, it } from 'vitest';
import {
  COUNTERPARTY_ALIAS_ROUTE,
  OFAC_ALIAS_ROUTE,
  SANCTIONS_ROUTE,
  X402_CHECK_ROUTES,
  x402DiscoveryDocument,
  x402OpenApiDocument,
  x402PaidRoutes,
} from '../lib/x402.js';

// x402scan's search (which agents and reviewers use to find new endpoints) matches
// the resource URL, not the description, so a counterparty check at /api/risk/x402
// and an OFAC screen at /api/risk/sanctions never came up for "counterparty" or
// "ofac". Each gets a plainly named alias: same check, same price, its own catalog row.
const PAY_TO = '0x000000000000000000000000000000000000dEaD';

describe('x402 alias routes', () => {
  it('are named after what they check', () => {
    expect(COUNTERPARTY_ALIAS_ROUTE).toBe('GET /api/risk/counterparty');
    expect(OFAC_ALIAS_ROUTE).toBe('GET /api/risk/ofac');
  });

  it('cost the same as the routes they alias and carry their own resource URL', () => {
    const routes = x402PaidRoutes(PAY_TO) as Record<string, any>;
    expect(routes[COUNTERPARTY_ALIAS_ROUTE].accepts.price).toBe(routes[X402_CHECK_ROUTES[0]].accepts.price);
    expect(routes[COUNTERPARTY_ALIAS_ROUTE].resource).toBe('https://api.chainward.ai/api/risk/counterparty');
    expect(routes[COUNTERPARTY_ALIAS_ROUTE].extensions.bazaar.info.input.queryParams).toEqual(
      routes[X402_CHECK_ROUTES[0]].extensions.bazaar.info.input.queryParams,
    );
    expect(routes[OFAC_ALIAS_ROUTE].accepts.price).toBe(routes[SANCTIONS_ROUTE].accepts.price);
    expect(routes[OFAC_ALIAS_ROUTE].resource).toBe('https://api.chainward.ai/api/risk/ofac');
    expect(routes[OFAC_ALIAS_ROUTE].description).toMatch(/OFAC/);
  });

  it('are listed in /.well-known/x402 and the OpenAPI document, and say what they alias', () => {
    expect(x402DiscoveryDocument().resources).toEqual(
      expect.arrayContaining(['https://api.chainward.ai/api/risk/counterparty', 'https://api.chainward.ai/api/risk/ofac']),
    );
    const paths = x402OpenApiDocument().paths as Record<string, any>;
    expect(paths['/api/risk/counterparty'].get['x-payment-info'].price.amount).toBe(paths['/api/risk/x402'].get['x-payment-info'].price.amount);
    expect(paths['/api/risk/counterparty'].get.description).toMatch(/\/api\/risk\/x402/);
    expect(paths['/api/risk/ofac'].get['x-payment-info'].price.amount).toBe(paths['/api/risk/sanctions'].get['x-payment-info'].price.amount);
    expect(paths['/api/risk/ofac'].get.description).toMatch(/\/api\/risk\/sanctions/);
  });
});
