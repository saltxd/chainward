import { describe, expect, it } from 'vitest';
import { chainMeta, chainQuery, parseChainParam } from '../chains';
import { reportPath } from '../risk';

describe('web chain helpers', () => {
  it('parses the ?chain param: absent → base, unknown → null', () => {
    expect(parseChainParam(undefined)).toBe('base');
    expect(parseChainParam('')).toBe('base');
    expect(parseChainParam('bsc')).toBe('bsc');
    expect(parseChainParam(['bsc', 'base'])).toBe('bsc');
    expect(parseChainParam('eth')).toBeNull();
  });

  it('keeps Base report URLs bare and namespaces other chains with a query', () => {
    expect(reportPath('0xABC')).toBe('/report/0xabc');
    expect(reportPath('0xABC', 'base')).toBe('/report/0xabc');
    expect(reportPath('0xABC', 'bsc')).toBe('/report/0xabc?chain=bsc');
    expect(chainQuery('bsc')).toBe('?chain=bsc');
    expect(chainQuery(undefined)).toBe('');
  });

  it('resolves chain presentation with a Base fallback for unknown values', () => {
    expect(chainMeta('bsc').nativeSymbol).toBe('BNB');
    expect(chainMeta('bsc').explorerAddressUrl('0x1')).toBe('https://bscscan.com/address/0x1');
    expect(chainMeta('nope').name).toBe('Base');
  });
});
