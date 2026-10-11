import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RiskReport } from '@/lib/api';
import { getAllDecodes } from '@/lib/decodes';
import { GET as reportOg } from '../report/[address]/og/route';
import { GET as decodeOg } from '../decodes/[slug]/og/route';

// The share-card routes: a PNG for a real address or decode, a 404 (not an
// image) for anything else, and the card renders for every kind of report.

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const ADDRESS = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

async function expectPng(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/png');
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC);
}

function apiReturns(report: Partial<RiskReport> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      report
        ? Response.json({
            success: true,
            data: {
              report: {
                address: ADDRESS,
                chain: 'base',
                band: 'low-signal',
                flags: [],
                not_assessed: [],
                freshness: { as_of_block: 1, generated_at: new Date().toISOString(), ttl_state: 'fresh' },
                classifier_version: '1',
                view_count: 0,
                disclaimer: '',
                ...report,
              },
            },
          })
        : new Response('not found', { status: 404 }),
    ),
  );
}

function reportRequest(address: string) {
  return reportOg(new Request(`https://chainward.ai/api/report/${address}/og`), { params: Promise.resolve({ address }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('report share card route', () => {
  it('404s an invalid address instead of drawing a card', async () => {
    apiReturns(null);
    const res = await reportRequest('not-an-address');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toBe('image/png');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('draws the answer card, cacheable', async () => {
    apiReturns({
      verdict: { label: 'hold', text: 'Hold', reason: 'Wallet is dormant.', limits: '' },
      flags: [{ id: 'dormant_wallet', severity: 'medium', title: 'Wallet is dormant', evidence: '', source: '' }],
    });
    const res = await reportRequest(ADDRESS);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=600');
    await expectPng(res);
  }, 20_000);

  it('draws the question card for a report filed before verdicts', async () => {
    apiReturns({ band: 'high-signal' });
    await expectPng(await reportRequest(ADDRESS));
  }, 20_000);

  it('draws the question card when there is no report yet', async () => {
    apiReturns(null);
    await expectPng(await reportRequest(ADDRESS));
  }, 20_000);
});

describe('decode share card route', () => {
  it('404s an unknown decode', async () => {
    const res = await decodeOg(new Request('https://chainward.ai/api/decodes/nope/og'), {
      params: Promise.resolve({ slug: 'no-such-decode' }),
    });
    expect(res.status).toBe(404);
  });

  it('draws a published decode', async () => {
    const [first] = getAllDecodes();
    expect(first).toBeDefined();
    const res = await decodeOg(new Request(`https://chainward.ai/api/decodes/${first!.slug}/og`), {
      params: Promise.resolve({ slug: first!.slug }),
    });
    await expectPng(res);
  }, 20_000);
});
