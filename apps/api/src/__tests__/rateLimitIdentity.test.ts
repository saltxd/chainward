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
