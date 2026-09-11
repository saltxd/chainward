import { describe, it, expect } from 'vitest';
import { validateWebhookUrl } from '../lib/validateUrl.js';

// The delivery worker in packages/indexer carries an identical range table;
// this pins the creation-time gate, which is what a user actually hits.
describe('validateWebhookUrl', () => {
  it('accepts a public HTTPS host', () => {
    expect(validateWebhookUrl('https://hooks.example.com/x')).toBeNull();
  });

  it('rejects plain HTTP', () => {
    expect(validateWebhookUrl('http://hooks.example.com/x')).toMatch(/HTTPS/);
  });

  it.each([
    ['RFC1918 10/8', 'https://10.42.0.1/hook'],
    ['RFC1918 172.16/12', 'https://172.20.0.5/hook'],
    ['RFC1918 192.168/16', 'https://192.168.1.1/hook'],
    ['loopback', 'https://127.0.0.2/hook'],
    ['link-local / cloud metadata', 'https://169.254.169.254/latest/meta-data'],
    ['CGNAT / Tailscale', 'https://100.101.102.103/hook'],
    ['benchmarking 198.18/15', 'https://198.18.0.1/hook'],
    ['multicast', 'https://224.0.0.1/hook'],
    ['broadcast', 'https://255.255.255.255/hook'],
  ])('rejects a raw private IP: %s', (_label, url) => {
    expect(validateWebhookUrl(url)).toMatch(/private/i);
  });

  it('still allows the public side of the CGNAT boundary', () => {
    expect(validateWebhookUrl('https://100.128.0.1/hook')).toBeNull();
    expect(validateWebhookUrl('https://100.63.255.255/hook')).toBeNull();
  });
});
