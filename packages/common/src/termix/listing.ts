// ─── ChainWard on TermiX: the agent and the one service it sells ──────────────
//
// Agent 365669 is ChainWard's ERC-8004 identity on BNB Chain. TermiX indexes the
// shared registry, so it already lists the agent (handle "365669"); no mint is
// needed to sell. The listing body is TermiX's strict create-listing schema
// (POST /api/v1/agents/:id/services). The worker matches orders to this service
// by skillTag. Price reasoning: docs/termix-provider.md.

export const CHAINWARD_TERMIX_AGENT_TOKEN_ID = '365669';
export const HIRE_CHECK_SKILL_TAG = 'set-and-earn-hire-check';

const DESCRIPTION = [
  'Will your agent pass Set and Earn\u2019s "hired by 3 wallets you neither own nor fund" rule? ' +
    "Send an ERC-8004 agent id on BNB Chain (for example 361259) or its owner's 0x address in your order note. " +
    'You get a verdict back, usually within 10 minutes: Hired by others, Hired by its own circle, or Not enough data, with the one reason it rests on, ' +
    'plus the full JSON report and a one-paragraph summary.',
  'The report covers the last 30 days of hires (TermiX escrow and the shared ERC-8183 contract). For each wallet that hired the agent it says ' +
    'whether that wallet is the owner, funded by the owner, linked by a direct transfer or a shared funder, inconclusive, or unlinked within ' +
    "the check's limits. Hired by others means 3 or more hirers have no link found, Set and Earn's bar as this check measures it.",
  'Same check as api.chainward.ai/api/risk/hires (x402). Method and cases: chainward.ai/decodes/set-and-earn-week-one-closed',
  'Limits: no link found is not proven independence. Trails stop at exchanges and contracts. It describes where money moved, not who controls a wallet.',
  'No id or address in the note? The agent asks for one and accepts the order only once it can run the check.',
].join('\n\n');

export const HIRE_CHECK_LISTING = {
  title: 'Set and Earn hire check: will your agent pass?',
  category: 'Security & Verification',
  basePrice: '0.25',
  currency: 'USDT',
  deliveryDays: 1,
  description: DESCRIPTION,
  skillTag: HIRE_CHECK_SKILL_TAG,
  tags: ['set-and-earn', 'erc-8004', 'bnb-chain', 'hire-check', 'on-chain-forensics'],
  instantBuyable: true,
  publicSearch: true,
  // The schema's minimum. A buyer who never accepts or disputes holds the payout
  // until this window passes, then the worker claims it (claimAfterTimeout).
  challengeWindowHours: 24,
  proofMethod: 'optimistic',
  settlementType: 'escrow',
  coverImageUrl: 'https://chainward.ai/chainward-mark-512.png',
  coverImageAlt: 'ChainWard',
} as const;
