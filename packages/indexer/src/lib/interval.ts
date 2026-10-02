// Parse PostgreSQL `interval` text into milliseconds.
//
// Interval columns come back from postgres.js as Postgres' own text output,
// which is NOT the "5 minutes" form they were written with:
//
//   '5 minutes'  -> '00:05:00'
//   '24 hours'   -> '24:00:00'
//   '1 day'      -> '1 day'
//   '1 day 2h'   -> '1 day 02:00:00'
//   '-1 day +2h' -> '-1 days +02:00:00'
//
// So this accepts any sequence of `<number> <unit>` terms and `[+-]HH:MM[:SS]`
// clock terms, which covers the default `postgres` IntervalStyle output,
// `postgres_verbose` ('@ 5 mins'), and the human input forms. Months and
// years use the same 30-day / 365.25-day lengths as EXTRACT(EPOCH ...).

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNIT_MS: Record<string, number> = {
  ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1,
  s: SECOND, sec: SECOND, secs: SECOND, second: SECOND, seconds: SECOND,
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
  w: 7 * DAY, week: 7 * DAY, weeks: 7 * DAY,
  mon: 30 * DAY, mons: 30 * DAY, month: 30 * DAY, months: 30 * DAY,
  y: 365.25 * DAY, yr: 365.25 * DAY, yrs: 365.25 * DAY, year: 365.25 * DAY, years: 365.25 * DAY,
};

// One term, anchored at lastIndex: `<number> <unit>` or `[+-]H:MM[:SS[.frac]]`.
const TERM = /\s*(?:([+-]?\d+(?:\.\d+)?)\s*([a-z]+)|([+-])?(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?)\s*/y;

/**
 * Milliseconds in a Postgres interval string, or null if any part of it is
 * unrecognised (no partial matches — garbage in is null, not a guess).
 */
export function parsePgInterval(text: string): number | null {
  let s = text.trim().toLowerCase();
  let sign = 1;
  if (s.startsWith('@')) s = s.slice(1); // postgres_verbose prefix
  if (s.endsWith(' ago')) {
    sign = -1; // postgres_verbose negation
    s = s.slice(0, -4);
  }
  s = s.trim();
  if (s === '') return null;

  let total = 0;
  let pos = 0;
  while (pos < s.length) {
    TERM.lastIndex = pos;
    const m = TERM.exec(s);
    if (!m || TERM.lastIndex === pos) return null;
    pos = TERM.lastIndex;

    if (m[2] !== undefined) {
      const unitMs = UNIT_MS[m[2]];
      if (unitMs === undefined) return null;
      total += parseFloat(m[1]!) * unitMs;
    } else {
      const ms =
        parseInt(m[4]!, 10) * HOUR + parseInt(m[5]!, 10) * MINUTE + parseFloat(m[6] ?? '0') * SECOND;
      total += m[3] === '-' ? -ms : ms;
    }
  }

  return Math.round(sign * total);
}
