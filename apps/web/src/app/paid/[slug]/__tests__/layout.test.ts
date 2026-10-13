import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '../layout';

// A withdrawn dataset keeps its page, but its title, search snippet and share
// card must not still advertise a price.
afterEach(() => vi.unstubAllGlobals());

function stubApi(data: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data }))));
}

const meta = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

describe('dataset page metadata', () => {
  it('prices a dataset on sale', async () => {
    stubApi({ title: 'TermiX wallets', description: 'd', priceUsdc: 10, withdrawn: null });
    const m = await meta('termix-wallets');
    expect(m.title).toBe('TermiX wallets: 10 USDC');
    expect(m.robots).toBeUndefined();
  });

  it('drops the price and asks search engines not to index a withdrawn dataset', async () => {
    stubApi({
      title: 'x402 sellers on Base',
      description: 'd',
      priceUsdc: 10,
      withdrawn: { reason: 'Withdrawn from sale while we ask the data source for permission.' },
    });
    const m = await meta('x402-sellers-base');
    expect(m.title).toBe('x402 sellers on Base (withdrawn from sale)');
    expect(JSON.stringify(m)).not.toMatch(/USDC/);
    expect(m.robots).toEqual({ index: false });
  });
});
