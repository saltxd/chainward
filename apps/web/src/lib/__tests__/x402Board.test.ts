import { describe, expect, it } from 'vitest';
import { proxiedPayersLabel, type ProxiedPayers } from '../x402Board';

const entry = (over: Partial<ProxiedPayers>): ProxiedPayers => ({
  proxy: '0x8e7769d440b3460b92159dd9c6d17302b036e2d6',
  name: 'Meridian',
  payers_resolved: 5,
  coverage_share: 1,
  source: 'x402scan',
  receipts: { read: 3, matched: 3 },
  payers_checked: 5,
  payers_funded_by_seller: 5,
  ...over,
});

describe('proxiedPayersLabel', () => {
  it('says how many payers sit behind the proxy and that all of them are funded by the seller', () => {
    expect(proxiedPayersLabel(entry({}))).toBe('payers behind Meridian: 5, all funded by the seller');
  });

  it('counts checked payers when not all of them trace back', () => {
    expect(proxiedPayersLabel(entry({ payers_resolved: 40, payers_checked: 30, payers_funded_by_seller: 12 }))).toBe(
      'payers behind Meridian: 40, 12 of 30 checked funded by the seller',
    );
  });

  it('says none traced when no payer reaches the seller', () => {
    expect(proxiedPayersLabel(entry({ name: 'Fluxa', payers_funded_by_seller: 0 }))).toBe('payers behind Fluxa: 5, none traced to the seller');
  });

  it('says how much of the volume the payers cover when it is partial', () => {
    expect(proxiedPayersLabel(entry({ coverage_share: 0.54, source: 'receipts' }))).toBe(
      'payers behind Meridian: 5 (54% of its volume), all funded by the seller',
    );
  });

  it('says when the payers could not be named', () => {
    expect(proxiedPayersLabel(entry({ payers_resolved: 0, coverage_share: 0, source: null, payers_checked: 0, payers_funded_by_seller: 0 }))).toBe(
      'payers behind Meridian not resolved',
    );
  });

  it('has no em dashes', () => {
    for (const e of [entry({}), entry({ payers_funded_by_seller: 0 }), entry({ payers_resolved: 0 })]) {
      expect(proxiedPayersLabel(e)).not.toMatch(/—/);
    }
  });
});
