import { describe, expect, it } from 'vitest';
import { discover, isDiscoveryUrl, toUrl } from '../src/discover.js';
import type { ProbeRecord, Target } from '../src/probe.js';

function docs(map: Record<string, { status: number; body?: unknown }>) {
  const asked: string[] = [];
  const fetchDoc = async (t: Target): Promise<ProbeRecord> => {
    asked.push(t.url);
    const hit = map[t.url];
    return {
      url: t.url,
      method: 'GET',
      sentAt: '2026-10-22T06:00:00Z',
      request: { headers: {} },
      status: hit?.status ?? 404,
      headers: {},
      bodyText: hit?.body === undefined ? 'not found' : JSON.stringify(hit.body),
    };
  };
  return { fetchDoc, asked };
}

describe('discover', () => {
  it('takes an endpoint URL as is, with the method asked for, and requests nothing', async () => {
    const { fetchDoc, asked } = docs({});
    const d = await discover('https://api.example.com/v1/quote', fetchDoc, 'post', '{"q":1}');
    expect(d.endpoints).toEqual([{ url: 'https://api.example.com/v1/quote', method: 'POST', body: '{"q":1}' }]);
    expect(asked).toEqual([]);
  });

  it('reads a host’s /.well-known/x402: URLs and objects, its own host only, no templates', async () => {
    const { fetchDoc, asked } = docs({
      'https://api.example.com/.well-known/x402': {
        status: 200,
        body: {
          version: 1,
          resources: [
            'https://api.example.com/v1/quote',
            { resource: 'https://api.example.com/v1/report', method: 'POST' },
            '/v1/relative',
            'https://other.example.org/v1/quote',
            'https://api.example.com/v1/lookup/{ip}',
            'https://api.example.com/v1/cve/:id',
            'https://api.example.com/v1/quote',
          ],
        },
      },
    });
    const d = await discover('api.example.com', fetchDoc);
    expect(asked).toEqual(['https://api.example.com/.well-known/x402']);
    expect(d.source).toBe('https://api.example.com/.well-known/x402');
    expect(d.endpoints).toEqual([
      { url: 'https://api.example.com/v1/quote', method: 'GET' },
      { url: 'https://api.example.com/v1/report', method: 'POST' },
      { url: 'https://api.example.com/v1/relative', method: 'GET' },
    ]);
    expect(d.skipped.map((s) => s.reason)).toEqual([
      'on another host (other.example.org): check it on its own',
      'a path template: send us an example URL',
      'a path template: send us an example URL',
    ]);
  });

  it('falls back to /openapi.json and takes the operations marked paid', async () => {
    const { fetchDoc, asked } = docs({
      'https://api.example.com/openapi.json': {
        status: 200,
        body: {
          openapi: '3.1.0',
          servers: [{ url: 'https://api.example.com/api' }],
          paths: {
            '/quote': { get: { responses: { '200': {}, '402': {} } } },
            '/report': { post: { 'x-payment-info': { price: '0.01' }, responses: { '200': {} } } },
            '/health': { get: { responses: { '200': {} } } },
            '/item/{id}': { get: { responses: { '402': {} } } },
          },
        },
      },
    });
    const d = await discover('https://api.example.com/', fetchDoc);
    expect(asked).toEqual(['https://api.example.com/.well-known/x402', 'https://api.example.com/openapi.json']);
    expect(d.endpoints).toEqual([
      { url: 'https://api.example.com/api/quote', method: 'GET' },
      { url: 'https://api.example.com/api/report', method: 'POST' },
    ]);
    expect(d.skipped.at(-1)).toEqual({ url: 'https://api.example.com/api/item/{id}', reason: 'a path template: send us an example URL' });
  });

  it('says so when a host has neither document', async () => {
    const { fetchDoc } = docs({});
    const d = await discover('api.example.com', fetchDoc);
    expect(d.endpoints).toEqual([]);
    expect(d.skipped).toHaveLength(2);
  });

  it('knows a discovery URL from an endpoint URL', () => {
    expect(isDiscoveryUrl(toUrl('api.example.com'))).toBe(true);
    expect(isDiscoveryUrl(toUrl('https://api.example.com/.well-known/x402'))).toBe(true);
    expect(isDiscoveryUrl(toUrl('https://api.example.com/openapi.json'))).toBe(true);
    expect(isDiscoveryUrl(toUrl('https://api.example.com/v1/quote'))).toBe(false);
  });
});
