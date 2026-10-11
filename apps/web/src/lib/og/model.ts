import type { RiskReport } from '../api';
import type { DecodeMeta } from '../decodes';
import { plainAnswer } from '../plainAnswer';

/**
 * What each share card says, kept apart from how it is drawn (cards.tsx) so the
 * words can be tested. Report cards reuse plainAnswer: the same word, headline
 * and reason the page shows, never a band label.
 */

const REASON_MAX = 150;
const SUBTITLE_MAX = 180;

/** 0x1234…abcd: the first 6 and last 4 characters, as in the page title. */
export function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Collapses whitespace and, when too long, cuts at a word boundary and ends with "…". */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const room = t.slice(0, max - 1);
  const cut = t[max - 1] === ' ' ? room.length : room.lastIndexOf(' ');
  const base = cut > max / 2 ? room.slice(0, cut) : room;
  return `${base.replace(/[\s,;:.(\-–]+$/, '')}…`;
}

/** Printed quotes for display type: an apostrophe after a letter or digit closes, anything else opens. */
export function typeset(text: string): string {
  return text.replace(/(^|[^\p{L}\p{N}])'/gu, '$1‘').replace(/'/g, '’');
}

/** The stamp's word, broken over two lines at the space nearest the middle when it's long. */
export function stampLines(word: string): string[] {
  if (word.length <= 9 || !word.includes(' ')) return [word];
  const mid = word.length / 2;
  let best = -1;
  for (let i = word.indexOf(' '); i !== -1; i = word.indexOf(' ', i + 1)) {
    if (best === -1 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return [word.slice(0, best), word.slice(best + 1)];
}

export type CardTone = 'pay' | 'hold' | 'unknown';

export type ReportCardModel =
  | {
      kind: 'answer';
      tone: CardTone;
      word: string;
      headline: string;
      reason: string;
      /** The one limit worth printing on a card. */
      footnote: string;
      short: string;
      chainName: string;
    }
  | { kind: 'ask'; short: string; chainName: string };

/**
 * The answer card for a report, or the question card when there is nothing to
 * answer with yet: no report, or one filed before verdicts existed.
 */
export function reportCard(
  report: RiskReport | null,
  address: string,
  chainName: string,
  now: Date = new Date(),
): ReportCardModel {
  const short = shortAddress(address);
  const answer = report ? plainAnswer(report, now) : null;
  if (!answer) return { kind: 'ask', short, chainName };
  return {
    kind: 'answer',
    tone: answer.label,
    word: answer.word,
    headline: typeset(answer.headline),
    reason: typeset(clip(answer.why, REASON_MAX)),
    footnote: answer.label === 'pay' ? 'On-chain only. Not a guarantee.' : 'On-chain only.',
    short,
    chainName,
  };
}

export interface DecodeCardModel {
  title: string;
  subtitle: string;
  dateLabel: string;
  /** Headline size in px: smaller for longer titles so they fit in three lines. */
  titleSize: number;
  url: string;
}

function editorialDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  // Frontmatter dates are calendar days; read them in UTC so no zone shifts the day.
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

function titleSize(length: number): number {
  if (length <= 32) return 80;
  if (length <= 70) return 66;
  return 56;
}

export function decodeCard(meta: Pick<DecodeMeta, 'title' | 'subtitle' | 'date' | 'slug'>): DecodeCardModel {
  const title = typeset(meta.title.replace(/\s+/g, ' ').trim());
  return {
    title,
    subtitle: typeset(clip(meta.subtitle ?? '', SUBTITLE_MAX)),
    dateLabel: editorialDate(meta.date),
    titleSize: titleSize(title.length),
    url: `chainward.ai/decodes/${meta.slug}`,
  };
}
