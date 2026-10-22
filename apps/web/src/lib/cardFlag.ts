import type { RiskReportCard, RiskTopFlagPreview } from './api';

/** Notes about how a check read the chain, not findings about the wallet. */
const NOTE_IDS = new Set(['activity_truncated']);

/**
 * The flag a list row headlines, and how many more findings sit behind it.
 * "Busy wallet: we read its newest N transfers" is a note, so it never leads a
 * row or counts toward "+N more". `known` is false when the API sent no
 * previews (version skew), so callers keep their own fallback.
 */
export function cardHeadline(card: RiskReportCard): { flag: RiskTopFlagPreview | null; more: number; known: boolean } {
  if (!card.top_flags) return { flag: null, more: Math.max(0, card.flag_count - 1), known: false };
  const notes = card.top_flags.filter((f) => NOTE_IDS.has(f.id)).length;
  const flag = card.top_flags.find((f) => !NOTE_IDS.has(f.id)) ?? null;
  return { flag, more: flag ? Math.max(0, card.flag_count - notes - 1) : 0, known: true };
}

/**
 * A flag in the words a first-time visitor reads in a list: what it is and, where
 * it isn't obvious, why it matters. Flags not listed keep the engine's title
 * (the privacy-pool and label flags already read plainly and vary by case).
 */
const PLAIN_TITLE: Record<string, string> = {
  ofac_sanctioned: 'On the US sanctions list',
  poisoning_decoy: 'Made to look like another address',
  stranded_value: 'Holds USDC but has gone quiet: money sent here may sit unclaimed',
  dormant_wallet: 'Has gone quiet: no token moves in over a week',
  counterparty_concentration: 'Only deals with one or two wallets',
  claim_vs_chain_offline: 'Listed as online, but idle on-chain',
  cluster_collapsed: 'Most of its peer group has gone quiet',
  factory_proxy_clone: 'A copy of a Virtuals contract, not custom code',
  inactive_no_history: 'No token activity we can see',
};

export function plainFlagTitle(flag: RiskTopFlagPreview): string {
  return PLAIN_TITLE[flag.id] ?? flag.title;
}
