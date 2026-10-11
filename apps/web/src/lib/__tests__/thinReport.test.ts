import { describe, expect, it } from 'vitest';
import { isThinReport } from '../risk';

// Which report pages search engines may index. A Pay or a Hold is an answer
// someone can act on, so it is indexed, flags or no flags. Only the third answer
// (no track record, inactive, couldn't check) or no report at all is thin.

describe('isThinReport', () => {
  it('indexes Pay, including an active Pay with zero flags', () => {
    expect(isThinReport({ label: 'pay' })).toBe(false);
  });

  it('indexes Hold', () => {
    expect(isThinReport({ label: 'hold' })).toBe(false);
  });

  it('is thin for the third answer, whatever its words', () => {
    expect(isThinReport({ label: 'unknown' })).toBe(true);
  });

  it('is thin when there is no report or no verdict', () => {
    expect(isThinReport(null)).toBe(true);
    expect(isThinReport(undefined)).toBe(true);
  });
});
