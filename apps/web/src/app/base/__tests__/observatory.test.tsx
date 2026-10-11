import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ObservatoryHero, TopAgentsPanel, WirePanel } from '../observatory-sections';
import { ObservatoryPage } from '../observatory-page';
import type { ObservatoryInitial } from '@/lib/observatory';

// /base is server rendered from these props: the HTML must carry the numbers and
// the lists (crawlers and link previews never run the client fetch).

const WALLET = '0xd8b7a2572571527e71b03879d38b403be5abe38e';

const initial: ObservatoryInitial = {
  overview: {
    agentsTracked: 507,
    namedAgents: 486,
    agentsBySource: { virtuals: 435, erc8004: 69, other: 3 },
    transactions24h: 177,
    transactions7d: 1310,
    activeAgents24h: 21,
    activeAgents7d: 109,
    activeAgents30d: 230,
    updatedAt: '2026-10-11T18:33:15.586Z',
  },
  mostActive: [
    { walletAddress: WALLET, agentName: 'Solveig', agentFramework: 'virtuals', slug: 'solveig', txCount: 380, rank: 1 },
  ],
  feed: [
    {
      timestamp: '2026-10-11T18:33:19Z',
      agentName: 'Larry',
      slug: 'larry',
      walletAddress: WALLET,
      direction: 'in',
      tokenSymbol: 'USDC',
      amountUsd: 11051.38,
      txHash: '0xabc',
    },
    {
      timestamp: '2026-10-11T18:25:41Z',
      agentName: '0x1398…',
      slug: null,
      walletAddress: WALLET,
      direction: 'out',
      tokenSymbol: 'AAPLc',
      amountUsd: null,
      txHash: '0xdef',
    },
  ],
  trends: {
    dailyTxCount: [{ date: '2026-10-10', count: 400 }],
    dailyActiveAgents: [
      { date: '2026-10-09', count: 19 },
      { date: '2026-10-10', count: 21 },
      { date: '2026-10-11', count: 4 },
    ],
  },
  x402: {
    generatedAt: '2026-10-09T00:45:36.054Z',
    rows: [
      { seller: '0x47d3394c7234714e4b9e9b74827c12be847f9dda', label: 'x402.dtelecom.org', volumeUsd: 8569.2, buyers: 25, verdict: 'Mixed' },
      { seller: '0x1cec447da1915f018bd74006ff6d695468b68dd4', label: null, volumeUsd: 4070.27, buyers: 5, verdict: 'Self-funded demand' },
    ],
  },
};

describe('ObservatoryHero', () => {
  it('leads with named wallets and how many move money, not the registry row count', () => {
    const html = renderToStaticMarkup(<ObservatoryHero overview={initial.overview} trends={initial.trends} />);
    expect(html).toContain(
      'We watch about 490 named agent wallets on Base, mostly Virtuals, plus ERC-8004 registrations. On a typical day about 20 of them move money.',
    );
    expect(html).toContain('Active, last 7 days');
    expect(html).toContain('>109<');
    expect(html).toContain('>21<');
    expect(html).not.toContain('3,379');
    expect(html).not.toMatch(/indexed live|ETH held/i);
  });

  it('renders without data instead of breaking', () => {
    const html = renderToStaticMarkup(<ObservatoryHero overview={null} trends={null} />);
    expect(html).toContain('n/a');
  });
});

describe('TopAgentsPanel', () => {
  const html = renderToStaticMarkup(<TopAgentsPanel mostActive={initial.mostActive} x402={initial.x402} />);

  it('has two lists, most active and x402 sellers, and no gas, ETH or health rankings', () => {
    expect(html).toContain('Most active (7 days)');
    expect(html).toContain('x402 sellers');
    expect(html).not.toMatch(/Highest gas|Most ETH|Healthiest|health|\/100/i);
  });

  it('puts both lists in the HTML, linking agents to their pages and sellers to the board', () => {
    expect(html).toContain('href="/base/solveig"');
    expect(html).toContain('Solveig');
    expect(html).toContain('380');
    expect(html).toContain('x402.dtelecom.org');
    expect(html).toContain('Self-funded demand');
    expect(html).toContain('href="/x402"');
    expect(html).toContain('09 Oct 2026');
  });
});

describe('WirePanel', () => {
  it('links a row to the agent page, or the report when there is none', () => {
    const html = renderToStaticMarkup(<WirePanel feed={initial.feed} />);
    expect(html).toContain('href="/base/larry"');
    expect(html).toContain(`href="/report/${WALLET}"`);
    expect(html).toContain('$11.1k');
    expect(html).toContain('no price');
  });
});

describe('ObservatoryPage', () => {
  it('server renders the hero, both lists and the wire from the initial props', () => {
    const html = renderToStaticMarkup(<ObservatoryPage initial={initial} />);
    expect(html).toContain('We watch about 490 named agent wallets');
    expect(html).toContain('Solveig');
    expect(html).toContain('Larry');
    expect(html).toContain('x402.dtelecom.org');
    expect(html).not.toContain('No leaderboard data yet');
  });
});

describe('/base page copy', () => {
  const page = readFileSync(fileURLToPath(new URL('../page.tsx', import.meta.url)), 'utf8');

  it('drops the monitor-your-own-agents FAQ and the health and live-indexing claims', () => {
    expect(page).not.toContain('Can I monitor my own agents?');
    expect(page).not.toMatch(/health score|indexed live|real time|real-time/i);
  });

  it('keeps its canonical URL', () => {
    expect(page).toContain("alternates: { canonical: 'https://chainward.ai/base' }");
  });

  it('has no em dashes in its copy', () => {
    expect(page).not.toContain('—');
  });
});
