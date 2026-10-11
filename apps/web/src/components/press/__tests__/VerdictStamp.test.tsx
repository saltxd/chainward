import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerdictStamp, verdictStamp } from '../VerdictStamp';

// The answer, stamped small on a list row: the word in capitals and the
// verdict's color (seal green for Pay, amber for Hold, soft ink for the rest).

describe('verdictStamp', () => {
  it('Pay wears the seal green, Hold the amber, the third answer soft ink', () => {
    expect(verdictStamp({ label: 'pay', text: 'Pay' })).toEqual({ word: 'PAY', tone: 'pay', color: 'var(--seal)' });
    expect(verdictStamp({ label: 'hold', text: 'Hold' })).toEqual({ word: 'HOLD', tone: 'hold', color: 'var(--sev-medium)' });
    expect(verdictStamp({ label: 'unknown', text: 'Inactive' })).toEqual({ word: 'INACTIVE', tone: 'unknown', color: 'var(--ink-soft)' });
    expect(verdictStamp({ label: 'unknown', text: 'No track record' })?.word).toBe('NO TRACK RECORD');
    expect(verdictStamp({ label: 'unknown', text: "Couldn't check" })?.word).toBe("COULDN'T CHECK");
  });

  it('is nothing on a card from an API that sends no verdict', () => {
    expect(verdictStamp(undefined)).toBeNull();
  });
});

describe('VerdictStamp', () => {
  it('renders the word in the verdict color', () => {
    const html = renderToStaticMarkup(<VerdictStamp verdict={{ label: 'hold', text: 'Hold' }} />);
    expect(html).toContain('HOLD');
    expect(html).toContain('var(--sev-medium)');
  });

  it('renders nothing without a verdict', () => {
    expect(renderToStaticMarkup(<VerdictStamp verdict={undefined} />)).toBe('');
  });
});
