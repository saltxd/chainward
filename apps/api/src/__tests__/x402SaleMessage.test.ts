import { describe, expect, it } from 'vitest';
import { saleMessage, salePayload } from '../lib/x402.js';

const ctx = {
  paymentPayload: { x402Version: 2, accepted: {}, payload: {}, resource: { url: 'https://api.chainward.ai/api/risk/seller-demand' } },
  requirements: { scheme: 'exact', network: 'eip155:8453', asset: '0xusdc', amount: '100000', payTo: '0xtreasury', maxTimeoutSeconds: 120, extra: {} },
  declaredExtensions: {},
  phase: 'after-handler',
  result: { success: true, transaction: '0xabc', network: 'eip155:8453', payer: '0xbuyer' },
} as unknown as Parameters<typeof saleMessage>[0];

describe('saleMessage', () => {
  it('names the path, the buyer, the amount in USDC and the tx', () => {
    const msg = saleMessage(ctx, '/api/risk/seller-demand?address=0x1');
    expect(msg).toContain('0.10 USDC');
    expect(msg).toContain('`/api/risk/seller-demand?address=0x1`');
    expect(msg).toContain('`0xbuyer`');
    expect(msg).toContain('https://basescan.org/tx/0xabc');
  });

  it('falls back to the resource url when the path is unknown and omits a missing buyer', () => {
    const noPayer = { ...ctx, result: { ...ctx.result, payer: undefined } } as typeof ctx;
    const msg = saleMessage(noPayer, undefined);
    expect(msg).toContain('`https://api.chainward.ai/api/risk/seller-demand`');
    expect(msg).not.toContain('Buyer');
  });

  it('prefers the settled amount over the authorized maximum', () => {
    const upto = { ...ctx, result: { ...ctx.result, amount: '50000' } } as typeof ctx;
    expect(saleMessage(upto, '/x')).toContain('0.05 USDC');
  });
});

describe('saleMessage hardening', () => {
  it('neutralises backticks and newlines in the buyer-controlled path and truncates it', () => {
    const hostile = '/api/risk/x402?address=0x1`@everyone`\nhttps://evil.test/' + 'a'.repeat(500);
    const msg = saleMessage(ctx, hostile);
    const bought = msg.split('\n').find((l) => l.startsWith('**Bought:**')) ?? '';
    expect(bought).not.toMatch(/`.*`.*`/); // exactly one code span, nothing escapes it
    expect(bought).not.toContain('\n');
    expect(bought.length).toBeLessThan(340);
  });
});

describe('salePayload', () => {
  it('disables mentions so a path containing @everyone cannot ping the channel', () => {
    const body = salePayload(ctx, '/x?note=@everyone');
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content).toContain('@everyone');
  });
});
