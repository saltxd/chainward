// Known senders that mass-airdrop unsolicited tokens to ACP agent wallets.
// These transfers do NOT represent agent activity and must be filtered from
// counters and recency calculations. Phase 2 will replace this with a generic
// classifier.
export const SPAM_SENDERS: string[] = [
  '0xD152f549545093347A162Dce210e7293f1452150', // HUB airdrop, mass distribution 2026-04-11
];

// Known spam token contracts (extends as new airdrop waves appear).
export const SPAM_TOKEN_CONTRACTS: string[] = [];

const SENDERS_LOWER = new Set(SPAM_SENDERS.map((a) => a.toLowerCase()));
const TOKENS_LOWER = new Set(SPAM_TOKEN_CONTRACTS.map((a) => a.toLowerCase()));

export function isSpamSender(address: string): boolean {
  return SENDERS_LOWER.has(address.toLowerCase());
}

export function isSpamToken(contractAddress: string): boolean {
  return TOKENS_LOWER.has(contractAddress.toLowerCase());
}
