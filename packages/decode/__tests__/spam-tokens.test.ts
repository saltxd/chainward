import { describe, it, expect } from 'vitest';
import { isSpamSender, SPAM_SENDERS } from '../src/spam-tokens.js';

describe('spam-tokens', () => {
  it('flags the known HUB airdrop sender', () => {
    expect(isSpamSender('0xD152f549545093347A162Dce210e7293f1452150')).toBe(true);
    expect(isSpamSender('0xd152f549545093347a162dce210e7293f1452150')).toBe(true); // lowercase
  });

  it('does not flag PaymentManager', () => {
    expect(isSpamSender('0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F')).toBe(false);
  });

  it('exports a list of known spam senders', () => {
    expect(SPAM_SENDERS.length).toBeGreaterThan(0);
  });
});
