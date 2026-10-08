import { describe, expect, it } from 'vitest';
import { normalizeAlertWallet } from '../services/alertService.js';

// Agents are stored with the checksummed address (agentService normalizes on
// register). An alert for the same wallet must match it however the caller
// spells it: the dashboard sends the stored form, the SDK, CLI and plugin send
// whatever the user typed. Found by the login smoke: a lowercase address got a
// 403 for a wallet registered seconds earlier.

const CHECKSUMMED = '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a';

describe('normalizeAlertWallet', () => {
  // All-lowercase and checksummed are the two spellings wallets and SDKs produce;
  // a wrong-case mix fails viem's strict check at registration too, so it is not a case here.
  it.each([CHECKSUMMED.toLowerCase(), CHECKSUMMED])(
    'maps %s to the stored checksummed form',
    (spelling) => {
      expect(normalizeAlertWallet('base', spelling)).toBe(CHECKSUMMED);
    },
  );

  it('refuses something that is not an address with a 400, not a 403', () => {
    expect(() => normalizeAlertWallet('base', '0xzz')).toThrowError(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_ADDRESS' }),
    );
  });

  it('leaves a valid Solana address as given', () => {
    const sol = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy';
    expect(normalizeAlertWallet('solana', sol)).toBe(sol);
  });
});
