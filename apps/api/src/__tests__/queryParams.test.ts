import { describe, expect, it } from 'vitest';
import { safeLimit } from '../lib/queryParams.js';

// A list route hands `?limit=` straight to SQL. Without a ceiling, one request
// for limit=1000000 reads a whole table into memory.
describe('safeLimit', () => {
  it('uses the default page size when no limit is given', () => {
    expect(safeLimit(undefined)).toBe(50);
  });

  it('passes a limit under the ceiling through', () => {
    expect(safeLimit('25')).toBe(25);
  });

  it('caps a limit above the ceiling', () => {
    expect(safeLimit('1000000')).toBe(200);
  });

  it('falls back to the default for a value that is not a number', () => {
    expect(safeLimit('lots')).toBe(50);
    expect(safeLimit('-5')).toBe(50);
  });
});
