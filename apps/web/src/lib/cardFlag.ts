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
