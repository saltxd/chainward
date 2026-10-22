import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkEndpoint, classify, verdictOf, type Outcome } from '../src/classify.js';
import { offersOf } from '../src/challenge.js';
import { lintRecord } from '../src/lint.js';
import { replay } from '../src/replay.js';
import { FIXTURE_NAMES, fixture, tokens } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

const offerUnits = (units: { key: string; outcome: Outcome }[]) =>
  Object.fromEntries(units.filter((u) => u.key !== 'standard').map((u) => [u.key.replace(/^offer:/, ''), u.outcome]));

// The six classes on the watch page, plus the passing and per-offer cases, each on a real 402.
describe('classify: the standard buyer on recorded 402s', () => {
  it.each([
    ['v1-names-in-v2', 'FAIL_V1_NETWORK_NAMES_IN_V2'],
    ['wrong-domain-base-usdc', 'FAIL_WRONG_EIP712_DOMAIN'],
    ['validity-seven-days', 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY'],
    ['validity-unix-time', 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY'],
    ['asset-not-a-contract', 'FAIL_ASSET_NOT_A_CONTRACT'],
    ['v2-body-only', 'FAIL_V2_BODY_ONLY_NO_HEADER'],
    ['no-x402-challenge', 'FAIL_NO_X402_CHALLENGE'],
    ['valid-base-usdc', 'SIGNS_VALID_AUTHORIZATION'],
    ['second-chain-wrong-domain', 'SIGNS_VALID_AUTHORIZATION'],
    ['token-without-eip3009', 'SIGNS_VALID_AUTHORIZATION'],
  ] as const)('%s: %s', async (name, expected) => {
    const c = await checkEndpoint(fixture(name), tokens());
    const std = c.units.find((u) => u.key === 'standard')!;
    expect(std.outcome).toBe(expected);
  });

  it('covers every fixture', () => {
    expect(FIXTURE_NAMES).toHaveLength(10);
  });
});

describe('classify: each offer on its own', () => {
  it('finds a broken second chain behind a working first one', async () => {
    const c = await checkEndpoint(fixture('second-chain-wrong-domain'), tokens());
    expect(offerUnits(c.units)).toEqual({
      'eip155:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:eip3009': 'SIGNS_VALID_AUTHORIZATION',
      'eip155:137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359:eip3009': 'SIGNS_VALID_AUTHORIZATION',
      'eip155:42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831:eip3009': 'SIGNS_VALID_AUTHORIZATION',
      // World Chain USDC's domain is {USDC, 2}; the offer says {USD Coin, 2}.
      'eip155:480:0x79a02482a880bce3f13e09da970dc34db4cd24d1:eip3009': 'FAIL_WRONG_EIP712_DOMAIN',
    });
  });

  it('tries a token outside the default list as a buyer who opted in to it', async () => {
    const c = await checkEndpoint(fixture('token-without-eip3009'), tokens());
    expect(offerUnits(c.units)).toEqual({
      'eip155:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:eip3009': 'SIGNS_VALID_AUTHORIZATION',
      'eip155:8453:0x50c5725949a6f0c72e6c4a641f24049a917db0cb:eip3009': 'FAIL_TOKEN_HAS_NO_EIP3009',
      'eip155:137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359:eip3009': 'SIGNS_VALID_AUTHORIZATION',
      'eip155:137:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063:eip3009': 'FAIL_TOKEN_HAS_NO_EIP3009',
      // No public RPC for Linea: it signs, but the token's domain can't be confirmed.
      'eip155:59144:0x176211869ca2b568f2a7d4ee941e073a821ee1ff:eip3009': 'SIGNS_DOMAIN_UNVERIFIED',
    });
  });

  it('adds no offer buyers when the 402 itself is unreadable', async () => {
    for (const name of ['v2-body-only', 'no-x402-challenge']) {
      const c = await checkEndpoint(fixture(name), tokens());
      expect(c.units.map((u) => u.key)).toEqual(['standard']);
    }
  });

  it('points a failure before any offer was chosen at the offer it is about', async () => {
    const c = await checkEndpoint(fixture('asset-not-a-contract'), tokens());
    expect(c.units.find((u) => u.key === 'standard')!.offerIndex).toBe(0);
  });

  it("leaves a v1-named duplicate of a correct offer alone, as the lint run did", async () => {
    const rec = fixture('valid-base-usdc');
    const header = JSON.parse(Buffer.from(rec.headers!['payment-required']!, 'base64').toString());
    header.accepts.push({ ...header.accepts[0], network: 'base' });
    const dup = { ...rec, headers: { ...rec.headers, 'payment-required': Buffer.from(JSON.stringify(header)).toString('base64') } };
    const c = await checkEndpoint(dup, tokens());
    expect(c.units.find((u) => u.key === 'standard')!.outcome).toBe('SIGNS_VALID_AUTHORIZATION');
    expect(c.units.filter((u) => u.kind === 'offer')).toHaveLength(1);
    expect(c.skipped).toEqual([{ offerIndex: 1, reason: expect.stringContaining('duplicate') }]);
  });
});

describe('classify: probe states', () => {
  it('reports a non-402 answer and a dead host as down, not as an x402 class', async () => {
    const moved = { ...fixture('valid-base-usdc'), status: 308, headers: { location: 'https://other.example.com/v1/lookup' }, bodyText: '' };
    const c1 = await checkEndpoint(moved, tokens());
    expect(c1.units).toEqual([expect.objectContaining({ key: 'standard', outcome: 'NO_402_RESPONSE', verdict: 'down', detail: 'HTTP 308 to https://other.example.com/v1/lookup' })]);
    const dead = { ...fixture('valid-base-usdc'), status: null, error: 'ECONNREFUSED: connect ECONNREFUSED' };
    const c2 = await checkEndpoint(dead, tokens());
    expect(c2.units[0]!.outcome).toBe('NETWORK_ERROR');
  });
});

describe('the offline replay', () => {
  it('never touches the network', async () => {
    const net = vi.fn(() => {
      throw new Error('network used');
    });
    vi.stubGlobal('fetch', net);
    for (const name of FIXTURE_NAMES) await checkEndpoint(fixture(name), tokens());
    expect(net).not.toHaveBeenCalled();
  });

  it('signs for as long as the 402 asks: 7 days, or until 2083 for a timestamp', async () => {
    const seven = await replay(fixture('validity-seven-days'));
    expect(seven.validitySeconds).toBeGreaterThanOrEqual(604800 - 2);
    expect(seven.validitySeconds).toBeLessThanOrEqual(604800);
    const stamp = await replay(fixture('validity-unix-time'));
    expect(stamp.validitySeconds).toBeGreaterThan(1_700_000_000);
  });

  it('reports where the stock client stopped', async () => {
    expect((await replay(fixture('v2-body-only'))).stage).toBe('parse');
    const v1 = await replay(fixture('v1-names-in-v2'));
    expect(v1.stage).toBe('payload');
    expect(v1.error).toMatch(/^No network\/scheme registered/);
  });

  it('classifies the same replay the same way as the lint run (stock_outcomes.py branches)', async () => {
    const rec = fixture('wrong-domain-base-usdc');
    const { accepts, version } = offersOf(rec);
    const r = await replay(rec);
    expect(classify(rec, accepts, version, r, tokens())).toEqual({
      outcome: 'FAIL_WRONG_EIP712_DOMAIN',
      detail: "eip155:8453 name='USDC' version='2' vs on-chain 'USD Coin'/'2'",
    });
  });
});

describe('lint findings', () => {
  it('names the field behind each failure', () => {
    const codes = (name: string) => lintRecord(fixture(name), tokens()).map((f) => `${f.class}:${f.code}`);
    expect(codes('v1-names-in-v2')).toContain('6:v2_legacy_network');
    expect(codes('wrong-domain-base-usdc')).toContain('1:eip712_domain_mismatch');
    expect(codes('validity-seven-days')).toContain('2:timeout_over_1d');
    expect(codes('validity-unix-time')).toContain('2:timeout_timestamp');
    expect(codes('asset-not-a-contract')).toContain('3:asset_not_contract');
    expect(codes('v2-body-only')).toContain('8:v2_no_header');
    expect(codes('token-without-eip3009')).toContain('8:asset_no_eip3009');
    expect(codes('valid-base-usdc')).toEqual([]);
  });
});

describe('verdicts', () => {
  it('judges failures and over-authorizations, reports the rest', () => {
    expect(verdictOf('FAIL_V1_NETWORK_NAMES_IN_V2')).toBe('fails');
    expect(verdictOf('OVER_AUTHORIZE_VALIDITY_OVER_1_DAY')).toBe('fails');
    expect(verdictOf('POLICY_OVER_1_USD_DEFAULT_CAP')).toBe('not_judged');
    expect(verdictOf('OUT_OF_SCOPE_NO_EVM_EXACT_OFFER')).toBe('not_judged');
    expect(verdictOf('SIGNS_DOMAIN_UNVERIFIED')).toBe('passes');
    expect(verdictOf('NO_402_RESPONSE')).toBe('down');
  });
});
