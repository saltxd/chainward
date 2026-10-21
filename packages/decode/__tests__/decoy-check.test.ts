import { afterEach, describe, expect, it } from 'vitest';
import { DECOY_NOT_ASSESSED, checkDecoyForReport, type DecoyReportData } from '../src/decoy-check.js';
import type { DecoyDeps, DecoyTransfer } from '../src/decoy.js';
import type { RiskAssessment } from '../src/risk-flags.js';

// The risk-check worker's decoy step: gated on what the decode already read (nonce, code,
// balances), so an ordinary wallet costs nothing extra; a failed read is named, not hidden.

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAYER = '0x228440f8d5df8b2e29c37255b291599060894bfb';
const PAYEE = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const LOOKALIKE = '0xf7eea0bae744497d7e7dcf93c7bc4a46b61667cd';
const WORLD: DecoyTransfer[] = [
  { from: PAYER, to: PAYEE, hash: '0xreal', value: 0.1, asset: 'USDC', rawContract: { address: USDC }, metadata: { blockTimestamp: '2026-10-21T15:43:13.000Z' } },
  { from: PAYER, to: LOOKALIKE, hash: '0xfake', value: 0.1, asset: 'ሀ‌‍Ѕ​‌D​​С', rawContract: { address: '0x72846b6b37ee99e88e1cfb0acd490ed766d91a00' }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' } },
];
const assessment: RiskAssessment = { band: 'low-signal', flags: [], not_assessed: ['Contract bytecode or source auditing'], classifier_version: 'v1', signal_density: 0 };

function data(over: { nonce?: number; code_size?: number; unread?: string[] } = {}): DecoyReportData {
  return {
    target: { wallet_address: LOOKALIKE },
    wallet: { nonce: over.nonce ?? 0, code_size: over.code_size ?? 0 },
    balances: { eth: { wei: '0' }, usdc: { amount: 0 } },
    fetch_meta: { state_unavailable: over.unread },
  };
}

function deps(calls: string[], fail = false): DecoyDeps {
  return {
    rpc: async (method) => {
      calls.push(method);
      if (fail) throw new Error('429');
      return method === 'eth_getCode' ? '0x' : '0x0';
    },
    transfers: async (params) => {
      const q = params as { fromAddress?: string; toAddress?: string; contractAddresses?: string[] };
      calls.push('transfers');
      if (fail) throw new Error('429');
      return { transfers: WORLD.filter((t) => (q.fromAddress ? t.from === q.fromAddress : t.to === q.toAddress)).filter((t) => !q.contractAddresses || q.contractAddresses.includes(t.rawContract?.address ?? '')) };
    },
  };
}

describe('checkDecoyForReport', () => {
  it('adds the poisoning_decoy flag for a planted look-alike on Base, from the state the decode read', async () => {
    const calls: string[] = [];
    const { assessment: a, status } = await checkDecoyForReport(assessment, data(), 'base', deps(calls));
    expect(status).toBe('ran');
    expect(a.flags.map((f) => f.id)).toEqual(['poisoning_decoy']);
    expect(a.band).toBe('high-signal');
    expect(calls.filter((c) => c !== 'transfers')).toEqual([]);
  });

  it('says ran, with no flag, for a never-used wallet that is not a decoy', async () => {
    const r = await checkDecoyForReport(assessment, { ...data(), target: { wallet_address: `0x${'7'.repeat(40)}` } }, 'base', deps([]));
    expect(r).toEqual({ assessment, status: 'ran' });
  });

  it('reads nothing for a wallet that has sent transactions or has code, or off Base: not applicable', async () => {
    const calls: string[] = [];
    for (const r of [
      await checkDecoyForReport(assessment, data({ nonce: 7 }), 'base', deps(calls)),
      await checkDecoyForReport(assessment, data({ code_size: 23 }), 'base', deps(calls)),
      await checkDecoyForReport(assessment, data(), 'bsc', deps(calls)),
    ]) {
      expect(r).toEqual({ assessment, status: 'not_applicable' });
    }
    expect(calls).toEqual([]);
  });

  it('says unavailable, and names it, for a never-used wallet when there is no Alchemy source', async () => {
    const r = await checkDecoyForReport(assessment, data(), 'base', null);
    expect(r.status).toBe('unavailable');
    expect(r.assessment.flags).toEqual([]);
    expect(r.assessment.not_assessed).toEqual([...assessment.not_assessed, DECOY_NOT_ASSESSED]);
  });

  it('does not gate on a nonce or code it could not read: unavailable, no reads', async () => {
    const calls: string[] = [];
    const r = await checkDecoyForReport(assessment, data({ unread: ['nonce'] }), 'base', deps(calls));
    expect(r).toEqual({ assessment, status: 'unavailable' });
    expect(calls).toEqual([]);
  });

  it('reads the balances itself when the decode could not', async () => {
    const calls: string[] = [];
    const r = await checkDecoyForReport(assessment, data({ unread: ['usdc_balance'] }), 'base', deps(calls));
    expect(r.assessment.flags.map((f) => f.id)).toEqual(['poisoning_decoy']);
    expect(calls).toContain('eth_call');
  });

  // A decoy's fake transfers count as activity, so a report without the check would answer Pay:
  // a failed read fails the check (the worker's job fails and nothing is charged).
  it('fails when its reads fail, rather than filing a report that might say Pay', async () => {
    await expect(checkDecoyForReport(assessment, data(), 'base', deps([], true))).rejects.toThrow(/decoy check/);
  });

  // The self-flag guard: deriveRiskFlags never flags ChainWard's own wallets, and neither does this step.
  describe('with the self-flag allowlist', () => {
    afterEach(() => {
      delete process.env.RISK_SELF_FLAG_ALLOWLIST;
    });
    it('reads nothing and flags nothing for an allowlisted address', async () => {
      process.env.RISK_SELF_FLAG_ALLOWLIST = `0x${'1'.repeat(40)}, ${LOOKALIKE.toUpperCase().replace('0X', '0x')}`;
      const calls: string[] = [];
      expect(await checkDecoyForReport(assessment, data(), 'base', deps(calls))).toEqual({ assessment, status: 'not_applicable' });
      expect(calls).toEqual([]);
    });
  });
});
