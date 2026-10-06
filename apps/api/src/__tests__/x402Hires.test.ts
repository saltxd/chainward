import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HIRES_ROUTE,
  PAID_FILE_ROUTE,
  SELLER_DEMAND_ROUTE,
  X402_CHECK_ROUTES,
  x402CheckPrice,
  x402DiscoveryDocument,
  x402HiresPrice,
  x402OpenApiDocument,
  x402PaidRoutes,
  x402SellerPrice,
} from '../lib/x402.js';

// The hire check as a paid x402 resource: price, catalog entries, Bazaar schema.
describe('x402 hire check', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is GET /api/risk/hires at $0.10 unless X402_HIRES_PRICE says otherwise', () => {
    expect(HIRES_ROUTE).toBe('GET /api/risk/hires');
    expect(x402HiresPrice()).toBe('$0.10');
    vi.stubEnv('X402_HIRES_PRICE', '$0.25');
    expect(x402HiresPrice()).toBe('$0.25');
  });

  it('leaves the existing prices alone', () => {
    expect(x402CheckPrice()).toBe('$0.05');
    expect(x402SellerPrice()).toBe('$0.10');
  });

  it('is listed in /.well-known/x402', () => {
    expect(x402DiscoveryDocument().resources).toContain('https://api.chainward.ai/api/risk/hires');
  });

  it('has an OpenAPI path with agent and chain params and x-payment-info', () => {
    const op = (x402OpenApiDocument().paths as Record<string, { get: Record<string, any> }>)['/api/risk/hires']!.get;
    expect(op.parameters.map((p: { name: string; required: boolean }) => [p.name, p.required])).toEqual([
      ['agent', true],
      ['chain', false],
    ]);
    expect(op.parameters[1].schema.enum).toEqual(['bsc']);
    expect(op['x-payment-info']).toEqual({ price: { mode: 'fixed', currency: 'USD', amount: '0.10' }, protocols: [{ x402: {} }] });
    expect(op.responses['200'].content['application/json'].example.data.summary).toHaveProperty('passes_three_independent');
  });

  it('is a paid route alongside the existing ones, priced and described for Set and Earn', () => {
    const routes = x402PaidRoutes('0x000000000000000000000000000000000000dEaD') as Record<string, any>;
    expect(Object.keys(routes)).toEqual(
      expect.arrayContaining([...X402_CHECK_ROUTES, PAID_FILE_ROUTE, SELLER_DEMAND_ROUTE, HIRES_ROUTE]),
    );
    const r = routes[HIRES_ROUTE];
    expect(r.accepts).toMatchObject({ scheme: 'exact', price: '$0.10', network: 'eip155:8453' });
    expect(r.resource).toBe('https://api.chainward.ai/api/risk/hires');
    expect(r.description).toMatch(/BNB Chain/);
    expect(r.description).toMatch(/Set and Earn/);
    expect(r.description).toMatch(/3 hires from wallets you neither own nor fund/);
    const input = r.extensions.bazaar;
    expect(input.info.input.queryParams).toEqual({ agent: expect.any(String), chain: 'bsc' });
    const schema = input.schema.properties.input.properties.queryParams;
    expect(schema.required).toEqual(['agent']);
    expect(schema.properties.agent.type).toBe('string');
    expect(schema.properties.chain.enum).toEqual(['bsc']);
  });

  it('keeps the existing routes priced as before', () => {
    const routes = x402PaidRoutes('0x000000000000000000000000000000000000dEaD') as Record<string, any>;
    expect(routes[X402_CHECK_ROUTES[0]].accepts.price).toBe('$0.05');
    expect(routes[SELLER_DEMAND_ROUTE].accepts.price).toBe('$0.10');
    expect(routes[PAID_FILE_ROUTE].accepts.price).toBe('$10');
  });
});
