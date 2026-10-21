import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WalletApiPage from '../page';

// /wallet-api sells one thing: a fast wallet lookup over HTTP. The page shows
// the call, says how to get a key and what the free tier covers, names the
// pay-per-call route, and never calls a wallet "safe" or "clean".
describe('/wallet-api', () => {
  const html = renderToStaticMarkup(<WalletApiPage />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  it('documents the address-poisoning decoy hold and its field', () => {
    expect(text).toContain('poisoning_decoy');
    expect(text).toMatch(/never sent a transaction/);
    expect(text).toContain('decoy.copies');
    expect(text).not.toMatch(/another wallet really paid/);
  });

  it('names the product', () => {
    expect(text).toContain('Wallet screening API');
  });

  it('shows the keyed call', () => {
    expect(text).toContain('https://api.chainward.ai/v1/wallet/0x');
    expect(text).toContain('Authorization: Bearer ag_');
  });

  it('states the free tier and how to get a key', () => {
    expect(text).toContain('Every account gets 1,000 lookups a month');
    expect(text).not.toMatch(/every key gets/i);
    expect(text).toMatch(/daily cap/);
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

  it('says a px402 privacy-pool relayer gets review, because the real payer is hidden', () => {
    expect(text).toContain('a known relayer of the px402 privacy pool');
    expect(text).toContain('privacy_relay');
    expect(text).toContain("so the real payer can't be screened");
  });

  it('states the limits without promising safety', () => {
    expect(text).toContain('not a clearance');
    expect(text).not.toMatch(/\bsafe\b|\bclean\b/i);
  });
});
