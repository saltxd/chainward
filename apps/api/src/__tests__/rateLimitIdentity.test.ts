import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { clientIdentity } from '../middleware/rateLimit.js';

async function identify(headers: Record<string, string>, user?: { id: string }) {
  const app = new Hono();
  app.get('/', (c) => {
    if (user) c.set('user' as never, user as never);
    return c.json(clientIdentity(c));
  });
  const res = await app.request('/', { headers });
  return (await res.json()) as { id: string; internal: boolean };
}

describe('rate limit client identity', () => {
  it('ignores an unvalidated Bearer ag_ key and keys on the Cloudflare IP', async () => {
    const a = await identify({ authorization: 'Bearer ag_aaaaaaaa', 'cf-connecting-ip': '203.0.113.7' });
    const b = await identify({ authorization: 'Bearer ag_bbbbbbbb', 'cf-connecting-ip': '203.0.113.7' });
    expect(a).toEqual({ id: 'ip:203.0.113.7', internal: false });
    expect(b.id).toBe(a.id);
  });

  it('keys on the authenticated user when auth middleware already ran', async () => {
    expect(await identify({ 'cf-connecting-ip': '203.0.113.7' }, { id: 'u1' })).toEqual({ id: 'user:u1', internal: false });
  });

  it('puts requests without CF-Connecting-IP in the internal bucket', async () => {
    expect(await identify({})).toEqual({ id: 'internal:cluster', internal: true });
    expect(await identify({ 'x-forwarded-for': '10.0.0.5, 192.168.1.20' })).toEqual({
      id: 'internal:192.168.1.20',
      internal: true,
    });
  });
});

// One IPv6 client usually holds a whole /64, so keying on the full address gave it
// 2^64 buckets. IPv6 clients count per /64; IPv4-mapped IPv6 counts as the IPv4.
describe('rate limit client identity: IPv6', () => {
  it('puts every address in one /64 in the same bucket', async () => {
    const a = await identify({ 'cf-connecting-ip': '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd' });
    const b = await identify({ 'cf-connecting-ip': '2001:0db8:1234:5678::1' });
    const c = await identify({ 'cf-connecting-ip': '2001:DB8:1234:5678:ffff::' });
    expect(a).toEqual({ id: 'ip:2001:db8:1234:5678::/64', internal: false });
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
  });

  it('keeps different /64s apart', async () => {
    const a = await identify({ 'cf-connecting-ip': '2001:db8:1234:5678::1' });
    const b = await identify({ 'cf-connecting-ip': '2001:db8:1234:5679::1' });
    expect(b.id).not.toBe(a.id);
  });

  it('expands compressed prefixes', async () => {
    expect((await identify({ 'cf-connecting-ip': '2001:db8::42' })).id).toBe('ip:2001:db8:0:0::/64');
    expect((await identify({ 'cf-connecting-ip': '::1' })).id).toBe('ip:0:0:0:0::/64');
  });

  it('counts IPv4-mapped IPv6 as the IPv4 address', async () => {
    expect((await identify({ 'cf-connecting-ip': '::ffff:203.0.113.7' })).id).toBe('ip:203.0.113.7');
    expect((await identify({ 'cf-connecting-ip': '::ffff:cb00:7107' })).id).toBe('ip:203.0.113.7');
  });

  it('leaves a value that is not an IP as it is', async () => {
    expect((await identify({ 'cf-connecting-ip': 'garbage' })).id).toBe('ip:garbage');
  });
});
