import { describe, expect, it } from 'vitest';
import { facilitatorConfigs, withStartupLog } from '../lib/x402.js';

describe('facilitatorConfigs', () => {
  it('uses PayAI alone when no CDP key is configured', () => {
    const list = facilitatorConfigs({});
    expect(list.map((f) => f.name)).toEqual(['payai']);
    expect(list[0]?.config.url).toBe('https://facilitator.payai.network');
  });

  it('puts CDP first and keeps PayAI as fallback when both CDP values are set', () => {
    const list = facilitatorConfigs({ CDP_API_KEY_ID: 'id', CDP_API_KEY_SECRET: 'secret' });
    expect(list.map((f) => f.name)).toEqual(['cdp', 'payai']);
    expect(list[0]?.config.url).toMatch(/^https:\/\/api\.cdp\.coinbase\.com\//);
    expect(typeof list[0]?.config.createAuthHeaders).toBe('function');
  });

  it('ignores a half-configured CDP key', () => {
    expect(facilitatorConfigs({ CDP_API_KEY_ID: 'id' }).map((f) => f.name)).toEqual(['payai']);
  });

  it('honours X402_FACILITATOR_URL for the PayAI slot', () => {
    const list = facilitatorConfigs({ X402_FACILITATOR_URL: 'https://example.test' });
    expect(list[0]?.config.url).toBe('https://example.test');
  });
});

describe('facilitatorConfigs (review fixes)', () => {
  it('bounds every facilitator request so a hanging facilitator cannot stall startup for 90 s', () => {
    for (const f of facilitatorConfigs({ CDP_API_KEY_ID: 'id', CDP_API_KEY_SECRET: 'secret' })) {
      expect(f.config.timeoutMs).toBe(30_000);
    }
  });
});

describe('withStartupLog', () => {
  it('passes a successful /supported through unchanged', async () => {
    const client = { getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }] }) };
    const wrapped = withStartupLog('cdp', client as never);
    await expect(wrapped.getSupported()).resolves.toEqual({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }] });
  });

  it('rethrows a failed /supported so x402ResourceServer still skips the facilitator', async () => {
    const client = { getSupported: async () => { throw new Error('401 Unauthorized'); } };
    const wrapped = withStartupLog('cdp', client as never);
    await expect(wrapped.getSupported()).rejects.toThrow('401 Unauthorized');
  });
});
