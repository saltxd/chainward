import { describe, expect, it } from 'vitest';
import { isSameSitePath, postLoginPath } from '../nextPath';

// After sign-in the login page goes to ?next=. Only a path on this site may be
// followed; anything a browser would read as another origin or a script is
// dropped for the dashboard.

describe('isSameSitePath', () => {
  it.each([
    '/agents?register=true&address=0xabc',
    '/overview',
    '/alerts?wallet=0x42a09a72ec47647fe9be1f450ab8f835d0ff556a&preset=failed_tx',
  ])('follows %s', (next) => {
    expect(isSameSitePath(next)).toBe(true);
  });

  it.each([
    ['protocol-relative URL', '//evil.com'],
    ['absolute URL', 'https://evil.com'],
    ['backslash browsers read as a slash', '/\\evil.com'],
    ['script URL', 'javascript:alert(1)'],
    ['relative path without a leading slash', 'agents'],
    ['tab browsers strip, leaving //', '/\t/evil.com'],
    ['newline browsers strip, leaving //', '/\n/evil.com'],
    ['empty string', ''],
  ])('refuses a %s', (_label, next) => {
    expect(isSameSitePath(next)).toBe(false);
  });

  it('refuses a missing value', () => {
    expect(isSameSitePath(null)).toBe(false);
    expect(isSameSitePath(undefined)).toBe(false);
  });
});

describe('postLoginPath', () => {
  it('goes to next when it is a path on this site', () => {
    expect(postLoginPath('/agents?register=true&address=0xabc')).toBe(
      '/agents?register=true&address=0xabc',
    );
  });

  it('goes to /overview otherwise, as before', () => {
    expect(postLoginPath(null)).toBe('/overview');
    expect(postLoginPath('//evil.com')).toBe('/overview');
    expect(postLoginPath('https://evil.com')).toBe('/overview');
  });
});
