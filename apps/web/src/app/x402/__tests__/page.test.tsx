import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Masthead and dateline read the session and node telemetry; not this test's subject.
vi.mock('@/components/press', () => ({
  PressShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Masthead: () => null,
  PressDateline: () => null,
  Colophon: () => null,
}));

import X402BoardPage from '../page';

const SELLER = '0x68396bd35874695ad86cd29410bd80a550991a2b';
const OTHER = `0x${'b'.repeat(40)}`;
const board = {
  generated_at: '2026-10-05T06:00:00.000Z',
  as_of_block: '51900000',
  check_window_days: 30,
  rows: [
    {
      seller: SELLER,
      label: 'example.com',
      x402scan_7d: { volume_usd: 12000, settlements: 900, buyers: 40 },
      report: {
        buyers_checked: 30,
        seller_funded: { buyers: 30, volume_share: 1, hops: { '3': 30 } },
        paid_back_share: 0,
        common_first_funder: null,
        proxied_payers: [],
        signals: [],
      },
    },
    { seller: OTHER, label: null, x402scan_7d: { volume_usd: 900, settlements: 20, buyers: 5 }, report: null },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('/x402', () => {
  it('offers the seller check on every board row, paid from the wallet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: board }))));
    const html = renderToStaticMarkup(await X402BoardPage());
    expect(html).toContain('<th>Fresh check</th>');
    expect(html).toContain(`data-resource="https://api.chainward.ai/api/risk/seller-demand?address=${SELLER}"`);
    expect(html).toContain('aria-label="Seller check for example.com: run the $0.10 check with your wallet"');
    expect(html).toContain(`data-resource="https://api.chainward.ai/api/risk/seller-demand?address=${OTHER}"`);
    expect(html).toContain('aria-label="Seller check for 0xbbbb…bbbb: run the $0.10 check with your wallet"');
  });
});
