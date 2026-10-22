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

async function render(): Promise<{ html: string; text: string; door: string }> {
  const html = renderToStaticMarkup(await CheckHomePage({ searchParams: Promise.resolve({}) }));
  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const start = html.indexOf('aria-label="For businesses"');
  const door = start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
  return { html, text, door };
}

// A first-time visitor, often from X, should know in one screen what to paste,
// what comes back, and that the site is alive: the newest findings sit right
// under the check, dated. Businesses get their own door: a free first check,
// then a regular one, quoted per program.
describe('home page', () => {
  it('opens in plain words: what you paste and what you get', async () => {
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

  it('shows the newest findings, dated, right under the check', async () => {
    const { text } = await render();
    const newest = getAllDecodes()[0]!;
    const at = text.indexOf('Latest findings');
    expect(at).toBeGreaterThan(-1);
    expect(text.indexOf(newest.title)).toBeGreaterThan(at);
    const month = new Date(newest.date).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    expect(text.slice(at, at + 400)).toContain(`${month} ${new Date(newest.date).getUTCDate()}`);
    expect(at).toBeLessThan(text.indexOf('Running a reward program or a platform?'));
    expect(text.indexOf('Running a reward program or a platform?')).toBeLessThan(text.indexOf('How to read a report'));
  });

  it('gives businesses a free first check, then a regular one, with no invented price', async () => {
    const { door, html } = await render();
    expect(door).toContain('Running a reward program or a platform?');
    expect(door).toContain('free first check');
    expect(door).toContain('every payout list before it goes out');
    expect(door).toContain('daily feed');
    expect(door).toContain('Quoted per program, paid on delivery.');
    expect(door).not.toMatch(/\$\s?\d/);
    expect(html).toContain('mailto:hello@chainward.ai');
  });

  it('moves recent wallet checks below the guide and drops the old casebook block', async () => {
    const { html, text } = await render();
    expect(text).not.toContain('From the casebook');
    const recent = html.indexOf('aria-label="Recent wallet checks"');
    expect(recent).toBeGreaterThan(-1);
    expect(recent).toBeGreaterThan(html.indexOf('How to read a report'));
  });

  it('uses no em dashes in the hero or the business door', async () => {
    const { text, door } = await render();
    expect(text.slice(0, text.indexOf('How to read a report'))).not.toContain('—');
    expect(door).not.toContain('—');
  });
});
