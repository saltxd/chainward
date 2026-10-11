import { describe, expect, it } from 'vitest';
import {
  activeSitemapAgents,
  agentFetchOutcome,
  feedHref,
  legacyAgentRedirect,
  observatoryDescription,
  observatoryLede,
  roundAbout,
  topX402Sellers,
  typicalDailyActive,
  type ObservatoryOverview,
  type ObservatoryTrends,
} from '../observatory';

const overview: ObservatoryOverview = {
  agentsTracked: 507,
  namedAgents: 486,
  agentsBySource: { virtuals: 435, erc8004: 69, other: 3 },
  transactions24h: 177,
  transactions7d: 1310,
  activeAgents24h: 21,
  activeAgents7d: 109,
  activeAgents30d: 230,
  updatedAt: '2026-10-11T18:33:15.586Z',
};

function trends(counts: number[]): ObservatoryTrends {
  return {
    dailyTxCount: [],
    dailyActiveAgents: counts.map((count, i) => ({ date: `2026-09-${10 + i}`, count })),
  };
}

describe('roundAbout', () => {
  it('rounds the way a person says "about"', () => {
    expect(roundAbout(7)).toBe(7);
    expect(roundAbout(21)).toBe(20);
    expect(roundAbout(23)).toBe(25);
    expect(roundAbout(486)).toBe(490);
    expect(roundAbout(3379)).toBe(3400);
  });
});

describe('typicalDailyActive', () => {
  it('is the median day, leaving out today (still filling)', () => {
    expect(typicalDailyActive(trends([18, 22, 19, 40, 3]))).toBe(21);
    expect(typicalDailyActive(trends([18, 22, 19, 3]))).toBe(19);
  });

  it('is null with no complete day', () => {
    expect(typicalDailyActive(trends([5]))).toBeNull();
    expect(typicalDailyActive(null)).toBeNull();
  });
});

describe('observatoryLede', () => {
  it('leads with named wallets and a typical day, not the registry row count', () => {
    expect(observatoryLede(overview, trends([19, 20, 22, 21, 5]))).toBe(
      'We watch about 490 named agent wallets on Base, mostly Virtuals, plus ERC-8004 registrations. On a typical day about 20 of them move money.',
    );
  });

  it('falls back to the last 24 hours without a trend', () => {
    expect(observatoryLede({ ...overview, activeAgents24h: 33 }, null)).toContain(
      'On a typical day about 35 of them move money.',
    );
  });

  it('drops "mostly Virtuals" when they are not most of the list', () => {
    const lede = observatoryLede({ ...overview, agentsBySource: { virtuals: 100, erc8004: 386, other: 0 } }, null);
    expect(lede).toContain('named agent wallets on Base plus ERC-8004 registrations.');
  });

  it('claims no count when the API predates named counts', () => {
    const { namedAgents: _n, ...old } = overview;
    const lede = observatoryLede({ ...old, agentsTracked: 3379 }, null);
    expect(lede).not.toMatch(/about \d|3,?[34]\d\d/);
    expect(observatoryLede(null, null)).not.toMatch(/about \d/);
  });

  it('never claims everything is indexed live, and has no em dash', () => {
    const lede = observatoryLede(overview, null);
    expect(lede).not.toMatch(/live|every/i);
    expect(lede).not.toContain('—');
  });
});

describe('observatoryDescription', () => {
  it('gives link previews the real counts', () => {
    expect(observatoryDescription(overview)).toBe(
      'About 490 named AI agent wallets on Base, mostly Virtuals, plus ERC-8004 registrations. 109 moved money in the last 7 days, 21 in the last 24 hours.',
    );
  });

  it('is null when the API predates named counts', () => {
    const { namedAgents: _n, ...old } = overview;
    expect(observatoryDescription(old)).toBeNull();
    expect(observatoryDescription(null)).toBeNull();
  });
});

describe('topX402Sellers', () => {
  const board = {
    generated_at: '2026-10-09T00:45:36.054Z',
    rows: Array.from({ length: 20 }, (_, i) => ({
      seller: `0x${String(i).padStart(40, '0')}`,
      label: i === 0 ? 'x402.dtelecom.org' : null,
      x402scan_7d: { volume_usd: 8569.2 - i, settlements: 10, buyers: 25 },
      report: i === 1 ? null : { verdict: { label: 'mixed', text: 'Mixed', reason: 'r', limits: 'l' } },
    })),
  };

  it('keeps the top of the weekly board', () => {
    const top = topX402Sellers(board, 5)!;
    expect(top.generatedAt).toBe('2026-10-09T00:45:36.054Z');
    expect(top.rows).toHaveLength(5);
    expect(top.rows[0]).toEqual({
      seller: board.rows[0]!.seller,
      label: 'x402.dtelecom.org',
      volumeUsd: 8569.2,
      buyers: 25,
      verdict: 'Mixed',
    });
    expect(top.rows[1]!.verdict).toBeNull();
  });

  it('is null with no board', () => {
    expect(topX402Sellers(null)).toBeNull();
    expect(topX402Sellers({ generated_at: 'x', rows: [] })).toBeNull();
  });
});

describe('feedHref', () => {
  const wallet = '0xD8B7A2572571527E71B03879D38B403BE5ABE38E';
  it('opens the agent page when there is one, else the report', () => {
    expect(feedHref({ slug: 'larry', walletAddress: wallet })).toBe('/base/larry');
    expect(feedHref({ slug: null, walletAddress: wallet })).toBe(`/report/${wallet.toLowerCase()}`);
    expect(feedHref({ slug: 'agent-d8b7a257', walletAddress: wallet })).toBe(`/report/${wallet.toLowerCase()}`);
  });
});

describe('agentFetchOutcome', () => {
  it('reads an agent, an old slug, or nothing', () => {
    expect(agentFetchOutcome(200, { success: true, data: { slug: 'larry' } })).toEqual({
      kind: 'agent',
      agent: { slug: 'larry' },
    });
    expect(agentFetchOutcome(301, { success: false, movedTo: 'captain-dackie' })).toEqual({
      kind: 'moved',
      slug: 'captain-dackie',
    });
    expect(agentFetchOutcome(301, { movedTo: '../etc' })).toEqual({ kind: 'missing' });
    expect(agentFetchOutcome(404, { success: false })).toEqual({ kind: 'missing' });
    expect(agentFetchOutcome(500, null)).toEqual({ kind: 'missing' });
  });
});

describe('legacyAgentRedirect', () => {
  const wallet = '0xD8B7A2572571527E71B03879D38B403BE5ABE38E';
  it('sends /agent/<wallet> to its report, keeping a non-Base chain', () => {
    expect(legacyAgentRedirect(wallet, undefined)).toBe(`/report/${wallet.toLowerCase()}`);
    expect(legacyAgentRedirect(wallet, 'base')).toBe(`/report/${wallet.toLowerCase()}`);
    expect(legacyAgentRedirect(wallet, 'bsc')).toBe(`/report/${wallet.toLowerCase()}?chain=bsc`);
  });

  it('is null (a 404) for a bad wallet or an unknown chain', () => {
    expect(legacyAgentRedirect('not-a-wallet', undefined)).toBeNull();
    expect(legacyAgentRedirect('0x1234', undefined)).toBeNull();
    expect(legacyAgentRedirect(wallet, 'solana')).toBeNull();
  });
});

describe('activeSitemapAgents', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it('keeps agents that moved money in the last 30 days', () => {
    const out = activeSitemapAgents(
      [
        { slug: 'larry', lastActiveAt: '2026-10-11T08:00:00Z' },
        { slug: 'stale', lastActiveAt: '2026-09-01T00:00:00Z' },
        { slug: 'no-date' },
        { slug: '../bad', lastActiveAt: '2026-10-11T08:00:00Z' },
      ],
      now,
    );
    expect(out).toEqual([{ slug: 'larry', lastActiveAt: new Date('2026-10-11T08:00:00Z') }]);
  });
});
