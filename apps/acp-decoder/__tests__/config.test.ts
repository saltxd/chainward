import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('throws when WALLET_ID is missing', () => {
    const env = {
      WALLET_ADDRESS: '0xabc',
      WALLET_SIGNER_PRIVATE_KEY: 'key',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    };
    expect(() => loadConfig(env)).toThrow(/WALLET_ID/);
  });

  it('throws when WALLET_SIGNER_PRIVATE_KEY is missing', () => {
    const env = {
      WALLET_ADDRESS: '0xabc',
      WALLET_ID: 'wid',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    };
    expect(() => loadConfig(env)).toThrow(/WALLET_SIGNER_PRIVATE_KEY/);
  });

  it('returns a config object when all required env vars are present', () => {
    const env = {
      WALLET_ADDRESS: '0xabc',
      WALLET_ID: 'wid',
      WALLET_SIGNER_PRIVATE_KEY: 'pem-key',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    };
    const cfg = loadConfig(env);
    expect(cfg.walletAddress).toBe('0xabc');
    expect(cfg.walletId).toBe('wid');
    expect(cfg.signerPrivateKey).toBe('pem-key');
    expect(cfg.defaultChainId).toBe(8453);
  });

  it('uses DEFAULT_CHAIN_ID when provided', () => {
    const env = {
      WALLET_ADDRESS: '0xabc',
      WALLET_ID: 'wid',
      WALLET_SIGNER_PRIVATE_KEY: 'pem-key',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
      DEFAULT_CHAIN_ID: '1',
    };
    const cfg = loadConfig(env);
    expect(cfg.defaultChainId).toBe(1);
  });
});
