import { describe, expect, it } from 'vitest';
import robots from '../robots';

// Google's matching: a rule matches a path that starts with it; '*' matches anything and a
// trailing '$' anchors the end.
function blockedBy(path: string, rule: string): boolean {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

function isBlocked(path: string): boolean {
  const { rules } = robots();
  const list = Array.isArray(rules) ? rules : [rules];
  return list.some((r) => [r.disallow ?? []].flat().some((rule) => blockedBy(path, rule)));
}

describe('robots.txt', () => {
  it('keeps the signed-in app and the API out of search', () => {
    for (const p of ['/wallet', '/wallet/0xabc', '/overview', '/agents', '/settings', '/login', '/api/risk/wallet']) {
      expect(isBlocked(p), p).toBe(true);
    }
  });

  // '/wallet' used to be a prefix rule, so it also hid the public /wallet-api page that the
  // sitemap lists.
  it('lets search engines crawl the public pages the sitemap lists', () => {
    for (const p of ['/wallet-api', '/rugcheck', '/reports', '/report/0xabc', '/decodes/x402-on-base', '/x402/watch', '/']) {
      expect(isBlocked(p), p).toBe(false);
    }
  });
});
