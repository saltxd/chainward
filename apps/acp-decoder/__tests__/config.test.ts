import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('throws when LITE_AGENT_API_KEY is missing', () => {
    const env = { WALLET_ADDRESS: '0xabc', DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' };
    expect(() => loadConfig(env)).toThrow(/LITE_AGENT_API_KEY/);
  });
  it('returns a config object when all required env vars are present', () => {
    const env = {
      LITE_AGENT_API_KEY: 'k',
      WALLET_ADDRESS: '0xabc',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    };
    const cfg = loadConfig(env);
    expect(cfg.liteAgentApiKey).toBe('k');
    expect(cfg.walletAddress).toBe('0xabc');
  });
});
