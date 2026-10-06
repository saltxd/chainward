import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The shell's masthead and dateline read the session and node telemetry; this
// test is about the page's own content, so they render as nothing here.
vi.mock('@/components/press', () => ({
  PressShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Masthead: () => null,
  PressDateline: () => null,
  Colophon: () => null,
}));

import SetAndEarnPage, { metadata } from '../page';
import type { SetAndEarnBoard } from '@/lib/setAndEarn';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const board: SetAndEarnBoard = {
  generated_at: '2026-10-06T06:00:00.000Z',
  as_of: { block: 125_950_000, time: '2026-10-05T23:59:00.000Z' },
  window: { from_block: 125_000_755, start: '2026-10-01T00:00:00Z', end: '2026-11-05T23:59:59Z' },
  totals: {
    agents_registered: 2930,
    agents_on_campaign_marketplaces: 746,
    agents_with_hires: 13,
    agents_hired: 8261,
    hires: { total: 8611, by_source: { termix_escrow: 8564, erc8183_shared: 47 } },
    agents_with_3_distinct_hirers: 41,
    agents_passing: 14,
  },
  rows: [
    {
      agent_id: 361259,
      name: 'Plinth keeper',
      owner: '0x' + 'a'.repeat(40),
      marketplace: 'termix',
      registered_at: '2026-10-03T10:00:00.000Z',
      registered_during_campaign: true,
      hires_total: 4,
      completed: 3,
      distinct_hirers: 3,
      by_source: { termix_escrow: 4, erc8183_shared: 0 },
      verdict_status: 'checked',
      owner_linked: 0,
      independent_within_limits: 3,
      inconclusive: 0,
      passes_three_independent: true,
      checked_at: '2026-10-06T06:00:00.000Z',
    },
  ],
  method: 'method text',
  limits: ['Counts are addresses, not people.', 'Never a safety verdict on an agent or its builder.'],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('/set-and-earn', () => {
  it('shows the totals, the campaign rule, the table, the paid check, the decode and the limits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: board }))));
    const html = renderToStaticMarkup(await SetAndEarnPage());

    for (const n of ['8,261', '8,611', '41', '14', '2,930', '746']) expect(html).toContain(`>${n}<`);
    expect(html).toMatch(/whenever it was registered/);
    expect(html).toContain(escape('“At least 3 completed hires from 3 distinct wallets that are not yours and not funded by yours”'));
    expect(html).toContain('href="https://bscscan.com/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/361259"');
    expect(html).toContain(escape('curl -i "https://api.chainward.ai/api/risk/hires?agent=<id>&chain=bsc"'));
    expect(html).toContain('0.10 USDC');
    expect(html).toContain('href="/decodes/set-and-earn-week-one"');
    for (const l of board.limits) expect(html).toContain(escape(l));
    expect(html).not.toMatch(/fake|scam|dirty|fraud/i);
  });

  it('says the campaign has closed after Nov 5', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: board }))));
    const html = renderToStaticMarkup(await SetAndEarnPage());
    expect(html).toMatch(/campaign closed Nov 5/i);
  });

  it('says the board is being built while the API has none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'board not built yet' }), { status: 503 })));
    const html = renderToStaticMarkup(await SetAndEarnPage());
    expect(html).toMatch(/first board is being built/i);
    expect(html).toContain(escape('curl -i "https://api.chainward.ai/api/risk/hires?agent=<id>&chain=bsc"'));
  });

  it('has its own title, canonical URL and share card', () => {
    expect(metadata.title).toMatch(/Set and Earn Board/);
    expect(metadata.alternates.canonical).toBe('https://chainward.ai/set-and-earn');
    expect(metadata.openGraph.images[0]!.url).toBe('/chainward-og-card.png');
  });
});
