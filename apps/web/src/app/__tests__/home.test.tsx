import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Masthead and dateline read the session and node telemetry; not this test's subject.
vi.mock('@/components/press', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/press')>();
  return {
    ...actual,
    PressShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Masthead: () => null,
    PressDateline: () => null,
    Colophon: () => null,
  };
});

// The check form uses the app router; there is none in a static render.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import CheckHomePage from '../page';
import { getAllDecodes } from '@/lib/decodes';

const SENTENCE = 'We prove whether a payout number is being gamed.';

function section(html: string, label: string): string {
  const start = html.indexOf(`aria-label="${label}"`);
  return start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
}

async function render(): Promise<{ html: string; text: string; hero: string; door: string }> {
  const html = renderToStaticMarkup(await CheckHomePage({ searchParams: Promise.resolve({}) }));
  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  return { html, text, hero: section(html, 'For reward programs'), door: section(html, 'For platforms') };
}

// The only sale so far came from a program with a dated payout and a measured
// loss to linked wallets. So the page leads with that buyer and one sentence a
// stranger can repeat; the free tools come second, as proof and the free way in.
describe('home page', () => {
  it('leads with the one sentence, who it is for, and one way to ask', async () => {
    const { html, text, hero } = await render();
    expect(html).toMatch(/<h1[^>]*>\s*We prove whether a payout number is being gamed\.\s*<\/h1>/);
    expect(text).toContain(
      'For programs paying out points, airdrops, trading rewards or referral bonuses: before your payout date, we show you how much of it is going to linked wallets, with the transactions that tie them together.',
    );
    expect(hero).toContain('Free first check:');
    expect(hero).toContain('every linked wallet, with the evidence, before the money goes out');
    expect(hero).toContain('href="mailto:hello@chainward.ai?subject=Free%20first%20check"');
    expect(hero).toContain('Ask for a free first check →');
    expect(hero).toContain('Quoted per program, paid on delivery.');
    expect(hero).toContain('href="/decodes/termix-on-chain"');
    // The hero is the first thing on the page: nothing from the free check before it.
    expect(text.indexOf(SENTENCE)).toBeLessThan(text.indexOf('Free check · Base and BNB Chain'));
  });

  // Payout screens have run on Monad and BNB Chain as well as Base; the
  // two-chain limit belongs to the free address check, not to this offer.
  it('does not limit the payout screen to the chains the free check covers', async () => {
    const { hero } = await render();
    expect(hero).not.toMatch(/Base and BNB Chain/);
  });

  it('names no price for the payout screen', async () => {
    const { hero, door } = await render();
    expect(hero).not.toMatch(/\$\s?\d|USDC/);
    expect(door).not.toMatch(/\$\s?\d|USDC/);
  });

  it('shows the newest findings, dated, right under the hero, then the free check', async () => {
    const { text } = await render();
    const newest = getAllDecodes()[0]!;
    const at = text.indexOf('Latest findings');
    expect(at).toBeGreaterThan(text.indexOf(SENTENCE));
    expect(text.indexOf(newest.title)).toBeGreaterThan(at);
    const month = new Date(newest.date).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    expect(text.slice(at, at + 400)).toContain(`${month} ${new Date(newest.date).getUTCDate()}`);
    const free = text.indexOf('Free check · Base and BNB Chain');
    expect(at).toBeLessThan(free);
    expect(free).toBeLessThan(text.indexOf('Run a launchpad, a wallet or a trading bot?'));
    expect(text.indexOf('Run a launchpad, a wallet or a trading bot?')).toBeLessThan(text.indexOf('How to read a report'));
  });

  it('keeps the free check, in plain words: what you paste and what you get', async () => {
    const { text } = await render();
    expect(text).toContain('Free check · Base and BNB Chain');
    expect(text).not.toContain('Forensic risk intake');
    expect(text).toContain('ChainWard · Free check');
    expect(text).not.toMatch(/Forensic Intake|opened on submit/i);
    expect(text).toContain('About to buy a token or pay a wallet? Paste the address first.');
    expect(text).toContain('A wallet: we answer Pay or Hold, with the reason.');
    expect(text).toContain('A Base token: the rug check shows who launched it and whether they dumped it.');
    expect(text).toContain('We only read the public blockchain record, and every answer links to it.');
  });

  it('keeps a free first check for launchpads, wallets and bots', async () => {
    const { door, html } = await render();
    expect(door).toContain('Run a launchpad, a wallet or a trading bot?');
    expect(door).toContain('free first check');
    expect(door).toContain('daily feed');
    expect(door).toContain('Quoted per platform, paid on delivery.');
    expect(html).toContain('mailto:hello@chainward.ai');
  });

  it('moves recent wallet checks below the guide and drops the old casebook block', async () => {
    const { html, text } = await render();
    expect(text).not.toContain('From the casebook');
    const recent = html.indexOf('aria-label="Recent wallet checks"');
    expect(recent).toBeGreaterThan(-1);
    expect(recent).toBeGreaterThan(html.indexOf('How to read a report'));
  });

  it('uses no em dashes in the hero, the free check or the platforms section', async () => {
    const { text, hero, door } = await render();
    expect(text.slice(0, text.indexOf('How to read a report'))).not.toContain('—');
    expect(hero).not.toContain('—');
    expect(door).not.toContain('—');
  });
});
