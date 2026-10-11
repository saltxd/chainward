/**
 * Where to send someone after sign-in. The middleware puts the page they were
 * headed to in ?next=; only a path on this site is followed. A second slash or
 * a backslash after the first makes browsers read another origin, and they
 * strip tabs and newlines before parsing, so all of those are refused.
 */

const DEFAULT_AFTER_LOGIN = '/overview';
const PARSE_BASE = 'https://chainward.invalid';

export function isSameSitePath(next: string | null | undefined): next is string {
  if (!next || next[0] !== '/' || next[1] === '/') return false;
  if (/[\\\s]/.test(next) || [...next].some((c) => c.charCodeAt(0) < 0x20 || c === '\x7f')) {
    return false;
  }
  try {
    return new URL(next, PARSE_BASE).origin === PARSE_BASE;
  } catch {
    return false;
  }
}

export function postLoginPath(next: string | null | undefined): string {
  return isSameSitePath(next) ? next : DEFAULT_AFTER_LOGIN;
}
