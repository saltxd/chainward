import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TokenReportView } from '../token-report';
import type { TokenReport } from '@/lib/api';

// A Base token pasted on chainward.ai gets the rug check, free: the answer, its reason
// and limit first, then the launch facts, what came up, and the paid check for bots.

const NOW = new Date('2026-10-20T12:00:00Z');
const TOKEN = `0x${'7'.repeat(40)}`;
const CREATOR = `0x${'c'.repeat(40)}`;

const CHECK: TokenReport = {
  token: TOKEN,
  chain: 'base',
  verdict: { label: 'review', reason: 'The wallet that launched it received 1,200,000,000 tokens in the launch transaction and had sent out 100% of them 26 seconds later.' },
  token_info: { name: 'Hook', symbol: 'HOOK', decimals: 18, total_supply: 100_000_000_000 },
  launch: {
    block: 52_800_000,
    time: '2026-10-20T09:00:00.000Z',
    tx: `0x${'1'.repeat(64)}`,
    creator: CREATOR,
    via: '0xe85a59c628f7d27878aceb4bf3b35733630083a9',
    launcher: 'clanker',
    launcher_note: "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.",
    token_admin: CREATOR,
  },
  creator: {
    address: CREATOR,
    type: 'wallet',
    sanctioned: false,
    first_seen: '2026-10-20T08:00:00.000Z',
    age_days_at_launch: 0,
    sent_txs: 3,
    first_funder: null,
    holds_pct: 0,
    launch_tokens: { received: 1_200_000_000, sent_pct: 100, first_send_after_sec: 20, sent_90pct_after_sec: 26 },
    clanker_launches_24h: 1,
    labels: [],
  },
  supply: { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, minted_to_creator: null, capped: false },
  flags: ['creator_sent_launch_tokens', 'new_creator'],
  as_of_block: 52_805_000,
  limits: 'On-chain only. Not a honeypot or contract-code audit.',
};

describe('TokenReportView', () => {
  const html = renderToStaticMarkup(<TokenReportView check={CHECK} now={NOW} />);

  it('opens with the answer, its reason and its limit', () => {
    expect(html).toContain('rr-answer--unknown');
    expect(html).toContain('>Review<');
    expect(html).toContain('Look closer before you buy.');
    expect(html).toContain('sent out 100% of them 26 seconds later');
    expect(html).toMatch(/does not test whether you can sell/);
  });

  it('lists the launch facts, linking the launch wallet to its own check', () => {
    expect(html).toContain(`href="/report/${CREATOR}"`);
    expect(html).toContain('Launch tokens');
    expect(html).toContain('90% gone 26 seconds after launch');
    expect(html).toContain(`https://basescan.org/tx/0x${'1'.repeat(64)}`);
  });

  it('lists what came up, in plain words', () => {
    expect(html).toContain('The launch wallet sent out its launch tokens within the hour');
    expect(html).toContain('The launch wallet was brand new at launch');
  });

  it('shows the full limits', () => {
    expect(html).toContain('Not a honeypot or contract-code audit.');
  });

  it('points bots and apps to the paid check', () => {
    expect(html).toContain('https://api.chainward.ai/api/risk/rugcheck?address=');
    expect(html).toContain('$0.02');
    expect(html).toContain('href="/docs"');
  });

  it('never says safe, and uses no em dashes', () => {
    expect(html).not.toMatch(/\bsafe\b/i);
    expect(html).not.toContain('—');
  });
});
