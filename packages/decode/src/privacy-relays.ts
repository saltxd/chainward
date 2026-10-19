// ─── Payers behind a privacy pool ─────────────────────────────────────────────
//
// px402 v2 (PRXVT) is a Chaumian-ecash layer for x402 on Base. An agent deposits
// USDC into its own slot in the PX402Reserve contract and spends blind-signed
// coins; a PRXVT relayer then pays the seller from the relayer's own USDC (an
// EIP-3009 transferWithAuthorization the seller's facilitator settles) and is
// reimbursed from the reserve a day later. The seller's inflow, and its
// authorizer, name the relayer and never the agent, so screening that "payer"
// screens PRXVT's relayer instead of whoever paid.
//
// Source: deliverables/px402/finding.md (ChainWard research, 2026-10-19), section 1
// "Parties and addresses", read on chain at block 52,827,036. The list is kept by
// hand: a new relayer registers on the reserve (RelayerRegistered, and the
// reserve's relayerList / relayerCount, 2 at that block) and is NOT picked up
// automatically. Add each one here, with its registration tx as the source.

export interface PrivacyRelay {
  /** Lowercase. */
  address: string;
  chain: 'base';
  /** Plain name, used in evidence text. */
  name: string;
  role: 'reserve' | 'relayer';
  /** Where to verify it on chain. */
  source: string;
}

/** The day the list was last checked against the reserve's relayerList. */
export const PRIVACY_RELAYS_AS_OF = '2026-10-19';

export const PRIVACY_RELAYS: readonly PrivacyRelay[] = [
  // PX402Reserve, deployed 2026-10-05 20:29:55 UTC by PRXVT's ops wallet 0xa116959f
  // (creation tx 0xf4875877…, block 52,221,424); verified source on Basescan.
  {
    address: '0xdd31c57e8f7cac78090a516292f0c9dea6c6119f',
    chain: 'base',
    name: 'the px402 reserve contract (PRXVT)',
    role: 'reserve',
    source: 'https://basescan.org/address/0xdd31c57E8F7CAC78090a516292f0C9Dea6c6119f#code',
  },
  // Relayer A: registered in the reserve's constructor, feeBps 25.
  {
    address: '0x6f890cc63aa57da9695528c9f5e3434897b32b8e',
    chain: 'base',
    name: 'px402 relayer A (PRXVT)',
    role: 'relayer',
    source: 'https://basescan.org/tx/0xf48758770e9633cda7ca261ef59c41aecdad0023c8164b9b95e8f1175e8fdeaf',
  },
  // Relayer B: RelayerRegistered + Bonded ($100), feeBps 25.
  {
    address: '0x47e5499c44ecf8c78da82b9b64183df1e301a0b4',
    chain: 'base',
    name: 'px402 relayer B (PRXVT)',
    role: 'relayer',
    source: 'https://basescan.org/tx/0x941204003dae596af0b78ac36d33fb8b9bd8bbc9a565df11bbaa00d5ecea384e',
  },
];

const BY_ADDRESS = new Map(PRIVACY_RELAYS.map((r) => [`${r.chain}:${r.address}`, r]));

/** The known privacy-pool reserve or relayer at this address on this chain, or null. Case-insensitive. */
export function privacyRelay(address: string, chain: string): PrivacyRelay | null {
  return BY_ADDRESS.get(`${chain}:${address.toLowerCase()}`) ?? null;
}

/** The one reason both the wallet lookup and the counterparty check give for a privacy relay. */
export const PRIVACY_RELAY_REASON =
  "Payments from this address come through the px402 privacy pool: the real payer is hidden and can't be screened.";

/** What the relay match cannot see, in one line. */
export const PRIVACY_RELAY_LIMITS = `Only the px402 reserve and relayers known on ${PRIVACY_RELAYS_AS_OF} are recognized; a newer relayer or another privacy pool is not.`;
