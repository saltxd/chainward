import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { upstreamTimeoutMs } from '../upstreamTimeout';

// The paid handlers in apps/api run for up to 55 s, and x402 settles on any 2xx
// whether or not the client is still connected. If the proxy gives up first,
// the buyer gets a 502 and is still charged. Paid paths must outlive them.
describe('upstreamTimeoutMs', () => {
  it.each([
    '/api/risk/x402',
    '/api/risk/x402/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    '/api/risk/seller-demand',
    '/api/risk/hires',
    '/api/paid/acp-sellers/file',
  ])('gives paid path %s 65 s', (path) => {
    expect(upstreamTimeoutMs(path)).toBe(65_000);
  });

  it.each([
    '/api/risk/check',
    '/api/risk/report/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    '/api/risk/attestation/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    '/api/observatory',
    '/api/x402/board',
    '/api/risk/x402board',
  ])('keeps free path %s at 30 s', (path) => {
    expect(upstreamTimeoutMs(path)).toBe(30_000);
  });
});

describe('API proxy upstream timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arms the upstream abort with the paid timeout on a paid path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 402 })));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await GET(new NextRequest('https://chainward.ai/api/risk/x402?address=0x4baadba26c3c0bdef9e8faf173925d463aa53bb2'));
    expect(timeout).toHaveBeenCalledWith(65_000);
  });

  it('arms the upstream abort with 30 s on a free path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await GET(new NextRequest('https://chainward.ai/api/observatory'));
    expect(timeout).toHaveBeenCalledWith(30_000);
  });
});
