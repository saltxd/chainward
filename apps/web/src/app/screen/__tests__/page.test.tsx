import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ScreenPage from '../page';
import DocsPage from '../../docs/page';

// /screen sells one thing: check a list of wallets before paying them. The page
// states the price, what comes back and its limits in plain words, and never
// calls a wallet "safe".
describe('/screen', () => {
  const html = renderToStaticMarkup(<ScreenPage />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('names the offer', () => {
    expect(text).toContain('Check a payout list before you pay it');
  });

  it('states the price and the free first batch', () => {
    expect(text).toContain('first 500 wallets free');
    expect(text).toContain('$0.05 per wallet');
    expect(text).toContain('$25 minimum');
    expect(text).toMatch(/USDC/);
  });

  it('says what comes back and that nothing is published', () => {
    expect(text).toMatch(/share a funder/);
    expect(text).toMatch(/OFAC/);
    expect(text).toMatch(/nothing is published/i);
  });

  it('states the limits', () => {
    expect(text).toContain('A shared funder is not proof');
    expect(text).toMatch(/not compliance advice/);
  });

  it('gives the contact and worked examples', () => {
    expect(html).toContain('hello@chainward.ai');
    expect(html).toContain('href="/decodes/termix-on-chain"');
    expect(html).toContain('href="/decodes/set-and-earn-week-one"');
  });

  it('never says safe and uses no em dashes in its own copy', () => {
    // The shared masthead and dateline are site chrome; check the page's sections.
    const own = html.slice(html.indexOf('<article class="da">'), html.indexOf('</article>'));
    expect(own.length).toBeGreaterThan(500);
    expect(own).not.toMatch(/\bsafe\b/i);
    expect(own).not.toContain('—');
  });

  it('is linked from /docs', () => {
    expect(renderToStaticMarkup(<DocsPage />)).toContain('href="/screen"');
  });
});
