import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WalletApiPage from '../page';

// /wallet-api sells one thing: a fast wallet lookup over HTTP. The page shows
// the call, says how to get a key and what the free tier covers, names the
// pay-per-call route, and never calls a wallet "safe" or "clean".
describe('/wallet-api', () => {
  const html = renderToStaticMarkup(<WalletApiPage />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  it('names the product', () => {
    expect(text).toContain('Wallet screening API');
  });

  it('shows the keyed call', () => {
    expect(text).toContain('https://api.chainward.ai/v1/wallet/0x');
    expect(text).toContain('Authorization: Bearer ag_');
  });

  it('states the free tier and how to get a key', () => {
    expect(text).toContain('1,000 lookups a month');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/settings"');
  });

  it('names the pay-per-call route and its price', () => {
    expect(text).toContain('/api/risk/wallet?address=');
    expect(text).toContain('$0.01');
    expect(text).toMatch(/x402/);
  });

  it('says what comes back', () => {
    for (const field of ['hold', 'review', 'no_flags', 'first_funder', 'age_days', 'sanctioned']) {
      expect(text).toContain(field);
    }
  });

  it('states the limits without promising safety', () => {
    expect(text).toContain('not a clearance');
    expect(text).not.toMatch(/\bsafe\b|\bclean\b/i);
  });
});
