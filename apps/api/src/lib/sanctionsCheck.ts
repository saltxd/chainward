import { OFAC_SNAPSHOT, isSanctioned } from '@chainward/decode';

/**
 * GET /api/risk/sanctions: is this address on the US Treasury OFAC SDN list?
 * A lookup in the bundled snapshot (packages/decode, refreshed by pnpm ofac:update),
 * so it costs nothing to answer and returns at once. EVM addresses are the same on
 * every chain, so there is no chain parameter. Never says "safe": not listed only
 * means OFAC has not published this exact address.
 */
export interface SanctionsAnswer {
  address: string;
  sanctioned: boolean;
  verdict: { label: 'sanctioned' | 'not_listed'; text: 'Hold' | 'Not listed'; reason: string };
  list: { name: string; source: string; fetched_at: string; addresses: number };
  limit: string;
  full_check: string;
}

const LIST_NAME = 'US Treasury OFAC SDN list, digital currency addresses (EVM)';

export function sanctionsAnswer(rawAddress: string): SanctionsAnswer {
  const address = rawAddress.toLowerCase();
  const sanctioned = isSanctioned(address);
  return {
    address,
    sanctioned,
    verdict: sanctioned
      ? {
          label: 'sanctioned',
          text: 'Hold',
          reason: 'This address is on the OFAC SDN list. Paying it may be illegal for US persons.',
        }
      : {
          label: 'not_listed',
          text: 'Not listed',
          reason: `This exact address is not among the ${OFAC_SNAPSHOT.addresses.length} EVM addresses OFAC has published.`,
        },
    list: {
      name: LIST_NAME,
      source: OFAC_SNAPSHOT.source,
      fetched_at: OFAC_SNAPSHOT.fetched_at,
      addresses: OFAC_SNAPSHOT.addresses.length,
    },
    limit:
      'Not listed is not a clearance: wallets that belong to or deal with a listed party, and addresses added after the snapshot date, are not covered. For behavior (activity, counterparties, flags) use the counterparty check.',
    full_check: `https://api.chainward.ai/api/risk/x402?address=${address}`,
  };
}
