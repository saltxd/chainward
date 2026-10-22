import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
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

import X402WatchPage from '../page';
import { WatchEmailLink, WATCH_MAILTO, campaignRef } from '../WatchEmailLink';

const TREASURY = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const TREASURY_CHECKSUMMED = '0xf7Ee65130Fb2B3bb42Cc5cbFED085d7D482667cD';

function stubConfig(body: unknown, ok = true) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function render(): Promise<{ html: string; text: string; own: string }> {
  const html = renderToStaticMarkup(await X402WatchPage());
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const own = html.slice(html.indexOf('<article class="da">'), html.indexOf('</article>'));
  return { html, text, own };
}

afterEach(() => vi.unstubAllGlobals());

describe('/x402/watch', () => {
  it('asks the question and says what the watch does', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain('Will a standard x402 buyer be able to pay you tomorrow?');
    expect(text).toContain('a stock x402 client (@x402/fetch with its default settings) tries each of your paid endpoints');
    expect(text).toContain('It never pays.');
    expect(text).toContain('we email you what broke and the field to fix');
  });

  it('states the price, the free first check and how to stop', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain('$10 a month in USDC on Base, paid after the free first check');
    expect(text).toContain('No account.');
    expect(text).toContain('To stop, reply to any of our emails.');
    expect(text).toMatch(/first check, free, within a day/);
    expect(text).toContain('A quiet day sends nothing.');
  });

  // Every number comes from the Oct 21 lint summary, scoped the way the funnel spec allows.
  it('prints the Oct 21 numbers with their scope, never a share of all x402', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain('(@x402/fetch and @x402/evm 2.27.0, default settings) at 1,500 paid endpoints from public x402 catalogs, picked from the 50,102 they list');
    expect(text).toContain('1,391 endpoints answered with a live 402');
    expect(text).toContain(
      "39 of them would make the buyer's payment fail (33) or have it sign a payment that stays open for more than a day (6)",
    );
    expect(text).toContain('Every one of the 39 sat on a host whose catalog listing already showed a mistake');
    expect(text).toContain('On hosts whose listings showed no mistake, the buyer tried to pay 1,267 endpoints');
    expect(text).toContain('the broken ones already showed the mistake in their listing and stayed broken');
    expect(text).not.toContain('a catalog had already flagged');
    expect(text).toContain('the buyer tried to pay 1,267 endpoints, and none failed on an x402 mistake');
    expect(text).toContain('The only 2 failures there were paused deployments');
    expect(text).toContain('not a rate for x402 as a whole');
    expect(text).toContain("A catalog listing doesn't reach your inbox. This does.");
    expect(text).not.toMatch(/\b3(\.\d+)?\s?%/);
    expect(text).not.toMatch(/\b41\b/);
  });

  it('lists the six classes in plain words with the technical name in parentheses', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain('Five make the payment fail; the sixth has the buyer sign a payment that stays open for more than a day');
    expect(text).not.toContain('These six things stopped it');
    for (const [name, n] of [
      ['v1 network names in a v2 challenge', 16],
      ['wrong EIP-712 domain in extra.name or extra.version', 12],
      ['maxTimeoutSeconds over 86,400, or a Unix time in its place', 6],
      ['asset is not a contract', 3],
      ['v2 challenge without the PAYMENT-REQUIRED header', 2],
      ['no x402 challenge', 2],
    ] as const) {
      expect(text).toContain(`( ${name} ). Oct 21: ${n} endpoints.`);
    }
  });

  it('shows the treasury from /api/brief/config in full, checksummed, with the copy warning', async () => {
    const fetchMock = stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { html, text } = await render();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/brief\/config$/);
    expect(html).toContain(`<code>${TREASURY_CHECKSUMMED}</code>`);
    expect(text).toContain('The only address we use; copy it from this page, never from a transaction history.');
    // The USDC contract, so a token that only calls itself USDC doesn't pass for it.
    expect(text).toContain('the token at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });

  it('never prints an address it could not read from the config', async () => {
    for (const setup of [
      () => stubConfig({ success: true, treasuryAddress: null, available: false }),
      () => stubConfig({ success: true, treasuryAddress: 'not-an-address' }),
      () => stubConfig({}, false),
      () => vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('api down')))),
    ]) {
      setup();
      const { html, text } = await render();
      // No copyable address block, and no stray treasury in the copy.
      expect(html).not.toContain('class="press-code"');
      expect(html.toLowerCase()).not.toContain(TREASURY);
      expect(text).toContain('The address could not be loaded just now.');
      vi.unstubAllGlobals();
    }
  });

  it('starts by email, with a counted CTA', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { html, text } = await render();
    expect(text).toContain('with your host, or your /.well-known/x402 or openapi.json URL');
    expect(text).toContain("Reply 'start' to it.");
    const mailto = WATCH_MAILTO.replace(/&/g, '&amp;');
    expect(html.split(`href="${mailto}"`).length - 1).toBeGreaterThanOrEqual(3);
    expect(WATCH_MAILTO).toMatch(/^mailto:hello@chainward\.ai\?subject=x402%20endpoint%20watch&body=/);
  });

  it('shows a sample alert on a made-up host', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain(
      "At 06:00 UTC our standard buyer requested GET https://api.example.com/v1/quote. The 402 offered only 'base' under x402Version 2, so the buyer found no network it could match and stopped. Yesterday it passed. Fix: use the CAIP-2 id 'eip155:8453'.",
    );
  });

  it('states the limits, including the probing rules', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { text } = await render();
    expect(text).toContain('throwaway key');
    expect(text).toMatch(/can't see what happens after a payment/);
    expect(text).toContain("Offers on non-EVM chains like Solana, and prices above the stock client's $1 cap, are reported, not judged.");
    expect(text).toContain('One unpaid request per endpoint a day, at least 1.2 seconds apart');
    expect(text).toContain('chainward-x402-lint/1.0 (+https://chainward.ai)');
  });

  it('links the board and the x402 decodes', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { html } = await render();
    for (const href of [
      '/x402',
      '/decodes/x402-on-base',
      '/decodes/x402-on-base-two-weeks-later',
      '/decodes/x402-closed-six',
      '/decodes/x402-top-ten-self-funded',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('keeps to the copy rules in its own sections', async () => {
    stubConfig({ success: true, treasuryAddress: TREASURY, available: true });
    const { own } = await render();
    expect(own.length).toBeGreaterThan(2000);
    expect(own).not.toContain('—');
    expect(own).not.toMatch(/\b(safe|scam|fraud)\w*/i);
  });
});

describe('the watch CTA', () => {
  it('reads only short campaign tags from ?ref=', () => {
    expect(campaignRef('?ref=x-1027')).toBe('x-1027');
    expect(campaignRef('?utm=1&ref=HN')).toBe('hn');
    expect(campaignRef('?ref=sx_1028')).toBe('sx_1028');
    expect(campaignRef('')).toBeNull();
    expect(campaignRef('?ref=')).toBeNull();
    expect(campaignRef('?ref=%3Cscript%3E')).toBeNull();
    expect(campaignRef(`?ref=${'a'.repeat(40)}`)).toBeNull();
    expect(campaignRef('?ref=someone@example.com')).toBeNull();
  });

  it('counts a click with its placement and the post that sent the visitor', () => {
    const spy = vi.fn();
    vi.stubGlobal('window', { location: { search: '?ref=x-1027' }, umami: { track: spy } });
    const link = WatchEmailLink({ placement: 'watch-hero', children: 'Email us' }) as ReactElement<{
      href: string;
      onClick: () => void;
    }>;
    expect(link.props.href).toBe(WATCH_MAILTO);
    link.props.onClick();
    expect(spy).toHaveBeenCalledWith('watch_cta_click', { placement: 'watch-hero', ref: 'x-1027' });

    spy.mockClear();
    vi.stubGlobal('window', { location: { search: '' }, umami: { track: spy } });
    link.props.onClick();
    expect(spy).toHaveBeenCalledWith('watch_cta_click', { placement: 'watch-hero' });
  });
});
