import { describe, expect, it } from 'vitest';
import { isThinReport, reportIndexable } from '../risk';

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

describe('reportIndexable', () => {
  it('keeps search engines off thin reports and off any report with a decoy finding, which anyone can plant', () => {
    expect(reportIndexable({ verdict: { label: 'pay' }, flags: [] })).toBe(true);
    expect(reportIndexable({ verdict: { label: 'hold' }, flags: [{ id: 'dormant_wallet' }] })).toBe(true);
    expect(reportIndexable({ verdict: { label: 'hold' }, flags: [{ id: 'poisoning_decoy' }] })).toBe(false);
    expect(reportIndexable({ verdict: { label: 'unknown' }, flags: [] })).toBe(false);
    expect(reportIndexable(null)).toBe(false);
  });
});
