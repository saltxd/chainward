// packages/indexer/src/scout/__tests__/detect.test.ts
import { describe, it, expect } from 'vitest';
import { MALFUNCTION } from '../detect.js';

describe('MALFUNCTION predicates', () => {
  it('emptyRows is true for zero, false otherwise', () => {
    expect(MALFUNCTION.emptyRows(0)).toBe(true);
    expect(MALFUNCTION.emptyRows(3)).toBe(false);
  });

  it('allNullAgdp is true only when every row has null grossAgenticAmount', () => {
    const nullRow = { grossAgenticAmount: null } as any;
    const valRow = { grossAgenticAmount: 5000 } as any;
    expect(MALFUNCTION.allNullAgdp([nullRow])).toBe(true);
    expect(MALFUNCTION.allNullAgdp([nullRow, valRow])).toBe(false);
    expect(MALFUNCTION.allNullAgdp([])).toBe(false);
  });

  it('noDecodedNames is true for an empty Set (deliverables missing/unmounted)', () => {
    expect(MALFUNCTION.noDecodedNames(new Set<string>())).toBe(true);
  });

  it('noDecodedNames is false for a non-empty Set', () => {
    expect(MALFUNCTION.noDecodedNames(new Set(['aixbt']))).toBe(false);
  });
});
