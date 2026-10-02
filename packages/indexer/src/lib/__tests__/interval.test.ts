import { describe, it, expect } from 'vitest';
import { parsePgInterval } from '../interval.js';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('parsePgInterval', () => {
  // What postgres.js actually hands back for interval columns (IntervalStyle
  // 'postgres'). The old regex parser missed every clock-form value and fell
  // back to 5 minutes.
  it.each([
    ['00:05:00', 5 * MIN],
    ['00:00:30', 30 * SEC],
    ['01:00:00', HOUR],
    ['24:00:00', 24 * HOUR],
    ['168:00:00', 7 * DAY],
    ['1 day', DAY],
    ['3 days', 3 * DAY],
    ['1 day 02:00:00', DAY + 2 * HOUR],
    ['2 days 00:30:00', 2 * DAY + 30 * MIN],
    ['1 mon 2 days 03:04:05', 30 * DAY + 2 * DAY + 3 * HOUR + 4 * MIN + 5 * SEC],
    ['1 year', 365.25 * DAY],
    ['00:00:01.5', 1500],
    ['-1 days +02:00:00', -DAY + 2 * HOUR],
    ['-00:05:00', -5 * MIN],
  ])('parses Postgres output %j', (text, ms) => {
    expect(parsePgInterval(text)).toBe(ms);
  });

  it.each([
    ['5 minutes', 5 * MIN],
    ['1 hour', HOUR],
    ['24 hours', 24 * HOUR],
    ['1 hour 30 minutes', 90 * MIN],
    ['90 seconds', 90 * SEC],
    ['2 weeks', 14 * DAY],
    ['1.5 hours', 90 * MIN],
    ['30m', 30 * MIN],
    ['  1 Day  ', DAY],
  ])('parses input-style %j', (text, ms) => {
    expect(parsePgInterval(text)).toBe(ms);
  });

  it.each([
    ['@ 5 mins', 5 * MIN],
    ['@ 1 day 2 hours', DAY + 2 * HOUR],
    ['@ 5 mins ago', -5 * MIN],
  ])('parses postgres_verbose %j', (text, ms) => {
    expect(parsePgInterval(text)).toBe(ms);
  });

  it.each(['', '   ', 'invalid', '5 fortnights', '5 minutes and change', 'P1D', '12:xx:00', '5'])(
    'returns null for %j rather than guessing',
    (text) => {
      expect(parsePgInterval(text)).toBeNull();
    },
  );
});
