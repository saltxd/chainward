import { describe, expect, it } from 'vitest';
import { TIER_LIMITS } from '@chainward/common/constants';
import { FREE_WALLET_LIMIT, LOGIN_PITCH, registerPrefill, watchWalletHref } from '../watch';

const ADDR = '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a';

describe('FREE_WALLET_LIMIT', () => {
  it('is the limit the API enforces for a free account', () => {
    expect(FREE_WALLET_LIMIT).toBe(TIER_LIMITS.free.agentLimit);
  });
});

describe('LOGIN_PITCH', () => {
  it('says what signing in gets you, with the real limit', () => {
    expect(LOGIN_PITCH).toBe(
      `Sign in to watch up to ${TIER_LIMITS.free.agentLimit} Base wallets: their transactions, balances, and alerts on Discord or a webhook. Free. No email, no password.`,
    );
  });
});

describe('watchWalletHref', () => {
  it('opens the register form with the address, lowercased', () => {
    expect(watchWalletHref(ADDR)).toBe(`/agents?register=true&address=${ADDR.toLowerCase()}`);
  });

  it('opens an empty register form without an address', () => {
    expect(watchWalletHref()).toBe('/agents?register=true');
  });
});

describe('registerPrefill', () => {
  const params = (q: string) => new URLSearchParams(q);

  it('opens the form with a valid address filled in, lowercased', () => {
    expect(registerPrefill(params(`register=true&address=${ADDR}`))).toEqual({
      open: true,
      address: ADDR.toLowerCase(),
    });
  });

  it('opens an empty form when there is no address', () => {
    expect(registerPrefill(params('register=true'))).toEqual({ open: true, address: '' });
  });

  it.each(['0xabc', 'not-an-address', `${ADDR}00`, ADDR.slice(2), '0xZZ09A72eC47647FE9BE1f450Ab8F835D0FF556a'])(
    'ignores an invalid address (%s) but still opens the form',
    (bad) => {
      expect(registerPrefill(params(`register=true&address=${bad}`))).toEqual({ open: true, address: '' });
    },
  );

  it('does nothing without register=true', () => {
    expect(registerPrefill(params(`address=${ADDR}`))).toEqual({ open: false, address: '' });
    expect(registerPrefill(params(''))).toEqual({ open: false, address: '' });
  });
});
