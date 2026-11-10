import { describe, expect, it } from 'vitest';
import { safeLimit, safeOffset } from '../lib/queryParams.js';

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

  // A page of zero rows still reports more pages, so a client paging to the
  // end would never stop.
  it('never returns an empty page size', () => {
    expect(safeLimit('0')).toBe(1);
    expect(safeLimit('0.4')).toBe(1);
  });
});

describe('safeOffset', () => {
  it('starts at the first row when no offset is given', () => {
    expect(safeOffset(undefined)).toBe(0);
  });

  it('passes a plain offset through', () => {
    expect(safeOffset('40')).toBe(40);
  });

  it('starts at the first row for a value that is not a number', () => {
    expect(safeOffset('abc')).toBe(0);
    expect(safeOffset('-5')).toBe(0);
  });

  // 1e21 does not fit a Postgres bigint, so the query fails with a 500.
  it('caps an offset Postgres could not read', () => {
    expect(safeOffset('1e21')).toBe(1_000_000);
  });
});
