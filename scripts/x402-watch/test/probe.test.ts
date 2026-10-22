import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GAP_MS, Pacer, USER_AGENT, isPublicAddress, probe } from '../src/probe.js';

let server: Server;
let base = '';
const seen: { method: string; url: string; headers: IncomingHttpHeaders; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      if (req.url === '/moved') {
        res.writeHead(301, { location: 'https://elsewhere.example.com/paid' });
        return res.end();
      }
      if (req.url === '/big') {
        res.writeHead(402, { 'content-type': 'text/plain' });
        return res.end('x'.repeat(400_000));
      }
      if (req.url === '/wide') {
        res.writeHead(402, { 'payment-required': 'A'.repeat(30_000), 'content-type': 'application/json' });
        return res.end('{}');
      }
      res.writeHead(402, { 'payment-required': 'e30=', 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('probe', () => {
  it('sends one unpaid GET with our user agent and nothing else', async () => {
    const rec = await probe({ url: `${base}/paid` }, { allowPrivate: true });
    expect(rec.status).toBe(402);
    expect(rec.headers!['payment-required']).toBe('e30=');
    const req = seen.at(-1)!;
    expect(req.method).toBe('GET');
    expect(req.headers['user-agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toBe('chainward-x402-lint/1.0 (+https://chainward.ai)');
    for (const h of ['payment-signature', 'x-payment', 'authorization', 'cookie']) expect(req.headers[h]).toBeUndefined();
    expect(rec.request.headers).toEqual({ 'user-agent': USER_AGENT, accept: 'application/json, */*;q=0.5' });
  });

  it('sends {} as the body of a POST unless the seller gave us a sample', async () => {
    await probe({ url: `${base}/paid`, method: 'POST' }, { allowPrivate: true });
    expect(seen.at(-1)).toMatchObject({ method: 'POST', body: '{}' });
    expect(seen.at(-1)!.headers['content-type']).toBe('application/json');
    await probe({ url: `${base}/paid`, method: 'post', body: '{"q":"btc"}' }, { allowPrivate: true });
    expect(seen.at(-1)).toMatchObject({ method: 'POST', body: '{"q":"btc"}' });
  });

  it('records a redirect and never follows it', async () => {
    const before = seen.length;
    const rec = await probe({ url: `${base}/moved` }, { allowPrivate: true });
    expect(rec.status).toBe(301);
    expect(rec.headers!.location).toBe('https://elsewhere.example.com/paid');
    expect(seen.length).toBe(before + 1);
  });

  it('caps the body at 256 KiB and reads headers past Node fetch’s 16 KiB limit', async () => {
    const big = await probe({ url: `${base}/big` }, { allowPrivate: true });
    expect(big.bodyText!.length).toBe(262_144);
    expect(big.bodyTruncated).toBe(true);
    const wide = await probe({ url: `${base}/wide` }, { allowPrivate: true });
    expect(wide.headers!['payment-required']).toHaveLength(30_000);
    expect(wide.headerBytes).toBeGreaterThan(30_000);
  });

  it('refuses private and loopback hosts by default', async () => {
    const before = seen.length;
    expect((await probe({ url: `${base}/paid` })).error).toMatch(/^refused: 127\.0\.0\.1 is not a public address/);
    expect((await probe({ url: 'http://[::1]/x' })).error).toMatch(/^refused/);
    expect((await probe({ url: 'http://localhost:1/x' })).error).toMatch(/ENOTPUBLIC|refused/);
    expect((await probe({ url: 'file:///etc/passwd' })).error).toMatch(/^refused: file:/);
    expect((await probe({ url: 'https://user:pw@api.example.com/x' })).error).toBe('refused: credentials in URL');
    expect(seen.length).toBe(before);
  });

  it('comes back with the error instead of throwing when nothing answers', async () => {
    const rec = await probe({ url: 'http://127.0.0.1:1/x' }, { allowPrivate: true });
    expect(rec.status).toBeNull();
    expect(rec.error).toMatch(/ECONNREFUSED/);
  });
});

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['104.18.1.1', true],
    ['2606:4700::1111', true],
    ['10.0.0.5', false],
    ['192.168.1.190', false],
    ['172.20.0.1', false],
    ['100.69.25.25', false], // carrier-grade NAT, where a tailnet lives
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['::', false],
    ['fd7a:115c:a1e0::1', false],
    ['fe80::1', false],
    ['::ffff:192.168.1.1', false],
    ['::ffff:8.8.8.8', true],
    ['not-an-ip', false],
  ])('%s -> %s', (ip, pub) => {
    expect(isPublicAddress(ip)).toBe(pub);
  });
});

describe('Pacer', () => {
  it('starts each request at least 1.2 s after the last one finished', async () => {
    let now = 0;
    const waits: number[] = [];
    const pacer = new Pacer(GAP_MS, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await pacer.wait();
    pacer.done();
    now += 300;
    await pacer.wait();
    pacer.done();
    now += 5000;
    await pacer.wait();
    expect(GAP_MS).toBe(1200);
    expect(waits).toEqual([900]);
  });
});
