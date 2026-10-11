import type { RiskVerdict } from '@/lib/api';

type CardVerdict = Pick<RiskVerdict, 'label' | 'text'>;

export interface StampLook {
  word: string;
  tone: 'pay' | 'hold' | 'unknown';
  color: string;
}

const TONE_COLOR: Record<StampLook['tone'], string> = {
  pay: 'var(--seal)',
  hold: 'var(--sev-medium)',
  unknown: 'var(--ink-soft)',
};

/** The answer as a list stamp: PAY, HOLD, or the third answer by case (INACTIVE and so on). */
export function verdictStamp(verdict: CardVerdict | undefined): StampLook | null {
  if (!verdict) return null;
  const tone: StampLook['tone'] = verdict.label === 'pay' || verdict.label === 'hold' ? verdict.label : 'unknown';
  return { word: verdict.text.toUpperCase(), tone, color: TONE_COLOR[tone] };
}

/**
 * The verdict stamped small on a list row, like the big stamp on the report:
 * a boxed, uppercase mono word in the verdict's color. Nothing when the card
 * carries no verdict (an older API).
 */
export function VerdictStamp({ verdict }: { verdict: CardVerdict | undefined }) {
  const look = verdictStamp(verdict);
  if (!look) return null;
  return (
    <span
      className={`verdict-stamp verdict-stamp--${look.tone}`}
      style={{
        display: 'inline-block',
        padding: '2px 6px 1px',
        border: '1.5px solid currentColor',
        color: look.color,
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: '10.5px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
      }}
    >
      {look.word}
    </span>
  );
}
