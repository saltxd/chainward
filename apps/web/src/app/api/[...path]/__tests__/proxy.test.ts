import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

function upstreamOk(init?: ResponseInit) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"ok":true}', { status: 200, ...init }));
}

afterEach(() => vi.unstubAllGlobals());

describe('API proxy', () => {
  it('forwards only allowlisted request headers', async () => {
    const fetchMock = upstreamOk();
    vi.stubGlobal('fetch', fetchMock);
    await GET(
      new NextRequest('https://chainward.ai/api/observatory', {
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '1.2.3.4',
          expect: '100-continue',
          cookie: 'cw_session=abc',
          'payment-signature': 'sig',
        },
      }),
    );
    const sent = fetchMock.mock.calls[0]![1]!;
    const headers = sent.headers as Headers;
    expect(headers.get('cf-connecting-ip')).toBe('203.0.113.7');
    expect(headers.get('cookie')).toBe('cw_session=abc');
    expect(headers.get('payment-signature')).toBe('sig');
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-real-ip')).toBeNull();
    expect(headers.get('expect')).toBeNull();
    expect(sent.redirect).toBe('manual');
  });

  it('refuses bodies over 1 MB without calling upstream', async () => {
    const fetchMock = upstreamOk();
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(
      new NextRequest('https://chainward.ai/api/risk/check', {
        method: 'POST',
        body: 'x'.repeat(1024 * 1024 + 1),
      }),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes Set-Cookie through once with Path=/ and marks credentialed responses no-store', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'cw_session=xyz; HttpOnly; Path=/api/auth');
    vi.stubGlobal('fetch', upstreamOk({ headers }));
    const res = await POST(
      new NextRequest('https://chainward.ai/api/auth/verify', {
        method: 'POST',
        headers: { cookie: 'cw_session=old', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.headers.getSetCookie()).toEqual(['cw_session=xyz; HttpOnly; Path=/']);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves anonymous responses cacheable by upstream rules', async () => {
    vi.stubGlobal('fetch', upstreamOk({ headers: { 'cache-control': 'public, max-age=60' } }));
    const res = await GET(new NextRequest('https://chainward.ai/api/observatory'));
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });
});
