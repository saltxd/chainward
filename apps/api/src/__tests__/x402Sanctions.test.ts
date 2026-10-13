import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFAC_SNAPSHOT } from '@chainward/decode';
import {
  PAID_FILE_ROUTE,
  SANCTIONS_ROUTE,
  x402DiscoveryDocument,
  x402LookupPrice,
  x402OpenApiDocument,
  x402PaidRoutes,
  x402SanctionsPrice,
} from '../lib/x402.js';
import { sanctionsAnswer } from '../lib/sanctionsCheck.js';
import { OFAC_LIST_FILES, ofacListUrl, refreshOfacList, resetOfacListForTests } from '@chainward/decode';

// The $0.01 sanctions screen: the cheapest call an agent can make before every
// payment. And the price ceiling: the catalog sweep bot that paid 929 sellers on
// 2026-10-08 never paid more than $0.10 for a call, so every per-call route stays
// at or under that.
const PAY_TO = '0x000000000000000000000000000000000000dEaD';

function usd(price: string): number {
  return Number(price.replace('$', ''));
}

describe('x402 sanctions screen', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is GET /api/risk/sanctions at $0.01 unless X402_SANCTIONS_PRICE says otherwise', () => {
    expect(SANCTIONS_ROUTE).toBe('GET /api/risk/sanctions');
    expect(x402SanctionsPrice()).toBe('$0.01');
    vi.stubEnv('X402_SANCTIONS_PRICE', '$0.02');
    expect(x402SanctionsPrice()).toBe('$0.02');
  });

  it('is a concrete paid route with a Bazaar input example', () => {
    const r = (x402PaidRoutes(PAY_TO) as Record<string, any>)[SANCTIONS_ROUTE];
    expect(r.accepts).toMatchObject({ scheme: 'exact', price: '$0.01', network: 'eip155:8453' });
    expect(r.resource).toBe('https://api.chainward.ai/api/risk/sanctions');
    expect(r.description).toMatch(/OFAC/);
    expect(r.extensions.bazaar.info.input.queryParams).toEqual({ address: expect.stringMatching(/^0x[0-9a-f]{40}$/) });
  });

  it('is listed in /.well-known/x402 and the OpenAPI document', () => {
    expect(x402DiscoveryDocument().resources).toContain('https://api.chainward.ai/api/risk/sanctions');
    const op = (x402OpenApiDocument().paths as Record<string, any>)['/api/risk/sanctions'].get;
    expect(op.parameters.map((q: { name: string; required: boolean }) => [q.name, q.required])).toEqual([['address', true]]);
    expect(op['x-payment-info'].price.amount).toBe('0.01');
    expect(op.responses['200'].content['application/json'].example.data.verdict.label).toBe('not_listed');
  });

  it('answers Hold for an address on the OFAC list', () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const a = sanctionsAnswer(listed.toUpperCase().replace('0X', '0x'));
    expect(a.address).toBe(listed);
    expect(a.sanctioned).toBe(true);
    expect(a.verdict).toEqual({ label: 'sanctioned', text: 'Hold', reason: expect.stringMatching(/OFAC/) });
    expect(a.list.fetched_at).toBe(OFAC_SNAPSHOT.fetched_at);
  });

  it('answers Not listed for anything else, and says that is not a clearance', () => {
    const a = sanctionsAnswer('0x4baadba26c3c0bdef9e8faf173925d463aa53bb2');
    expect(a.sanctioned).toBe(false);
    expect(a.verdict.label).toBe('not_listed');
    expect(a.verdict.text).toBe('Not listed');
    expect(a.limit).toMatch(/not a clearance/i);
    expect(a.full_check).toBe('https://api.chainward.ai/api/risk/x402?address=0x4baadba26c3c0bdef9e8faf173925d463aa53bb2');
    expect(JSON.stringify(a)).not.toMatch(/\bsafe\b/i);
  });
});

// The list refreshes at runtime (packages/decode/src/ofac.ts); the answer must
// say which list it used, so a buyer can see how fresh the screen is.
describe('x402 sanctions screen after a refresh', () => {
  afterEach(() => resetOfacListForTests());

  it('catches a newly listed address and reports the refreshed list', async () => {
    const added = `0x${'e'.repeat(40)}`;
    // Every real file names at least one EVM address; the refresh refuses an empty one.
    const body = (asset: string) => (asset === 'ETH' ? [...OFAC_SNAPSHOT.addresses, added].join('\n') : OFAC_SNAPSHOT.addresses[0]!);
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const asset = OFAC_LIST_FILES.find((f) => ofacListUrl(f.asset) === url)!.asset;
      return new Response(body(asset));
    }) as typeof fetch;
    const result = await refreshOfacList({ fetch: fakeFetch, now: () => new Date('2026-10-13T06:00:00Z') });
    expect(result.ok).toBe(true);

    const a = sanctionsAnswer(added);
    expect(a.sanctioned).toBe(true);
    expect(a.verdict.text).toBe('Hold');
    expect(a.list.fetched_at).toBe('2026-10-13');
    expect(a.list.addresses).toBe(OFAC_SNAPSHOT.addresses.length + 1);

    const clear = sanctionsAnswer('0x4baadba26c3c0bdef9e8faf173925d463aa53bb2');
    expect(clear.verdict.reason).toContain(`${OFAC_SNAPSHOT.addresses.length + 1} EVM addresses`);
  });
});

describe('x402 price ceiling', () => {
  it('prices the dataset check at $0.05', () => {
    expect(x402LookupPrice()).toBe('$0.05');
  });

  it('keeps every per-call route at or under $0.10; only whole files cost more', () => {
    const routes = x402PaidRoutes(PAY_TO) as Record<string, any>;
    for (const [key, r] of Object.entries(routes)) {
      if (key === PAID_FILE_ROUTE || key.endsWith('/file')) continue;
      expect(usd(r.accepts.price), key).toBeLessThanOrEqual(0.1);
    }
  });
});
