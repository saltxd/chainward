import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The Umami beacon proxy read the whole POST body with no size cap before
// forwarding it. A beacon is a few hundred bytes; anything over 64 KB is refused.
vi.hoisted(() => {
  process.env.UMAMI_INTERNAL_URL = 'http://umami.test';
});

import { POST } from '../route';

afterEach(() => vi.unstubAllGlobals());

function beacon(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest('https://chainward.ai/a/api/send', { method: 'POST', body, headers });
}

describe('analytics beacon proxy', () => {
  it('forwards a normal beacon', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(beacon('{"type":"event"}'));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://umami.test/api/send');
    expect(new TextDecoder().decode(fetchMock.mock.calls[0]![1]!.body as Uint8Array)).toBe('{"type":"event"}');
  });

  it('refuses a body over 64 KB with 413, without calling Umami', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(beacon('x'.repeat(64 * 1024 + 1)));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a declared Content-Length over 64 KB before reading the body', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(beacon('{}', { 'content-length': String(10 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
