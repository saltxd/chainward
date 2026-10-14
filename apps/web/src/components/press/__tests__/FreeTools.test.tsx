import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FreeTools } from '../FreeTools';

// Under every decode and report, beside the paid Intel Brief: the two cheaper
// ways in. A free wallet API key for people screening from code, and list
// screening for people about to pay rewards to many wallets.
describe('FreeTools', () => {
  const html = renderToStaticMarkup(<FreeTools />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('offers the free wallet API key', () => {
    expect(html).toContain('href="/wallet-api"');
    expect(text).toContain('1,000 lookups a month');
  });

  it('offers payout list screening with the free first batch', () => {
    expect(html).toContain('href="/screen"');
    expect(text).toContain('first 500 wallets are free');
  });

  it('never calls a wallet safe', () => {
    expect(text).not.toMatch(/\bsafe\b/i);
  });
});
