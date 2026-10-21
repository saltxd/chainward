import { describe, expect, it } from 'vitest';
import { intakeCopy } from '../intake-copy';

// The checker takes a wallet or, on Base, a token. On /rugcheck it asks for a token only.
describe('intakeCopy', () => {
  it('asks for a wallet or a token on Base', () => {
    const c = intakeCopy('base', 'wallet');
    expect(c.hint).toMatch(/wallet you're about to pay or hire, or a token you're about to buy/);
    expect(c.error).toMatch(/^That isn't a Base address\./);
    expect(c.button).toBe('Run the risk check →');
  });

  it('asks for a wallet only on BNB Chain, where there is no rug check', () => {
    const c = intakeCopy('bsc', 'wallet');
    expect(c.hint).not.toMatch(/token/);
    expect(c.error).toMatch(/^That isn't a BNB Chain wallet address\./);
  });

  it('asks for a Base token on the rug check page', () => {
    const c = intakeCopy('base', 'token');
    expect(c.label).toBe('Subject: Base token address');
    expect(c.hint).toMatch(/Clanker, Virtuals or any Base token/);
    expect(c.error).toMatch(/^That isn't a Base token address\./);
    expect(c.button).toBe('Run the rug check →');
    expect(c.footnote).toMatch(/\$0\.02/);
  });

  it('uses no em dashes', () => {
    for (const chain of ['base', 'bsc'] as const) {
      for (const variant of ['wallet', 'token'] as const) expect(JSON.stringify(intakeCopy(chain, variant))).not.toContain('—');
    }
  });
});
