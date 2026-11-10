/**
 * Safe query parameter parsing — returns undefined instead of NaN/Invalid Date.
 */

/** Parse a string to a positive integer, or return fallback (default undefined). */
export function safeInt(value: string | undefined, fallback?: number): number | undefined {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Page size for a list route: the caller's `?limit=`, never above `max`. */
export function safeLimit(value: string | undefined, max = 200, fallback = 50): number {
  return Math.min(safeInt(value) ?? fallback, max);
}

/** Parse a string to a Date, or return undefined if invalid. */
export function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d;
}
