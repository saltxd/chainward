import { describe, expect, it } from 'vitest';
import { facilitatorConfigs } from '../lib/x402.js';

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
