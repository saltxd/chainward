import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// A signed-out visitor sent to /login must come back to the page they asked
// for, query included: "Watch this wallet" carries the address in it.

const ORIGIN = 'https://chainward.ai';

function request(path: string, signedIn = false): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`);
  if (signedIn) req.cookies.set('chainward-session', 'jwt');
  return req;
}

function redirectedTo(res: Response): URL {
  const location = res.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location!);
}

describe('middleware', () => {
  it('sends a signed-out visitor to /login with the page and query in next', () => {
    const path = '/agents?register=true&address=0x42a09a72ec47647fe9be1f450ab8f835d0ff556a';
    const to = redirectedTo(middleware(request(path)));
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('next')).toBe(path);
  });

  it('keeps a plain dashboard path as next', () => {
    const to = redirectedTo(middleware(request('/alerts')));
    expect(to.searchParams.get('next')).toBe('/alerts');
  });

  it('sends a signed-in visitor on /login to next when it is a path on this site', () => {
    const next = '/agents?register=true&address=0xabc';
    const to = redirectedTo(middleware(request(`/login?next=${encodeURIComponent(next)}`, true)));
    expect(`${to.pathname}${to.search}`).toBe(next);
    expect(to.origin).toBe(ORIGIN);
  });

  it('sends a signed-in visitor on /login to /overview when next points off the site', () => {
    const to = redirectedTo(middleware(request(`/login?next=${encodeURIComponent('//evil.com')}`, true)));
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe('/overview');
  });

  it('lets a signed-in visitor through to the dashboard', () => {
    const res = middleware(request('/agents', true));
    expect(res.headers.get('location')).toBeNull();
  });
});
