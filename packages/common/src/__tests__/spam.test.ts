import { describe, it, expect } from 'vitest';
import { isSpamToken } from '../constants/spam.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const SPAM = '0x1b7a3aadd3a0007986e3ff1f07005e6b4e1dbe50';
const UNLISTED = '0x000000000000000000000000000000000000dead';

describe('isSpamToken', () => {
  it('never flags known-legit tokens, even with spammy metadata', () => {
    expect(isSpamToken(USDC, 'claim free at scam', 'USDC')).toBe(false);
  });

  it('flags addresses on the spam list', () => {
    expect(isSpamToken(SPAM, 'Whatever', 'X')).toBe(true);
  });

  it('flags telegram-handle name patterns', () => {
    expect(isSpamToken(UNLISTED, 'Join t.me/pool now')).toBe(true);
  });

  it('flags non-ASCII (lookalike) symbols', () => {
    expect(isSpamToken(UNLISTED, 'Normal Name', 'ꓴꓢꓓС')).toBe(true);
  });

  it('passes a clean unlisted token', () => {
    expect(isSpamToken(UNLISTED, 'Cool Token', 'COOL')).toBe(false);
  });

  it('(known limitation) flags symbols ending in a TLD', () => {
    expect(isSpamToken(UNLISTED, '', 'TKN.io')).toBe(true);
  });
});
