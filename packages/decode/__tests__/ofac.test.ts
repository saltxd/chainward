import { describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import { OFAC_LIST_FILES, isSanctioned, ofacListUrl, parseOfacList, renderOfacSnapshot } from '../src/ofac.js';

// Lazarus Group, Ronin Bridge exploit (SDN designation 2022-04-14), listed under ETH.
const LAZARUS = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96';
// Listed under the BSC and ARB tags, not ETH: the snapshot must union the EVM files.
const BSC_TAGGED = '0x4f47bc496083c727c5fbe3ce9cdf2b0f6496270c';
const NORMAL = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

const hex40 = (c: string) => `0x${c.repeat(40)}`;

describe('parseOfacList', () => {
  it('lowercases, dedupes and sorts one address per line', () => {
    const text = `${hex40('B')}\n${hex40('a')}\n${hex40('b')}\n`;
    expect(parseOfacList(text)).toEqual([hex40('a'), hex40('b')]);
  });

  it('tolerates blank lines and CRLF line endings', () => {
    expect(parseOfacList(`\r\n${hex40('c')}\r\n\r\n`)).toEqual([hex40('c')]);
  });

  it.each([
    ['too short', '0x123'],
    ['too long', `${hex40('a')}0`],
    ['not hex', hex40('z')],
    ['no 0x prefix', 'a'.repeat(40)],
    ['a non-EVM address', '1Df883c96LVauVsx9FEgnsourD8DELwCUQ'],
  ])('rejects a malformed line (%s) and names its line number', (_label, bad) => {
    expect(() => parseOfacList(`${hex40('a')}\n${bad}\n`)).toThrow(/line 2/);
  });

  // A token file's non-EVM lines are Bitcoin (Omni) or Tron addresses. Anything
  // else, such as an HTML error page served with 200, must refuse the whole file
  // instead of reading as "no addresses here".
  it.each([
    ['an HTML page', '<!doctype html><title>Too many requests</title>'],
    ['a JSON error body', '{"message":"Not Found"}'],
    ['a comment line', '# sanctioned addresses'],
  ])('refuses %s in a token list instead of skipping it', (_label, junk) => {
    expect(() => parseOfacList(`${hex40('d')}\n${junk}\n`, { skipNonEvm: true })).toThrow(/line 2/);
  });

  it('can skip the non-EVM entries of a multi-chain token list, but still rejects a malformed 0x line', () => {
    const usdt = `TXp6GhfS4ALMPtMNdSWGk7orXSCMrPwz8M\n${hex40('d')}\n1Df883c96LVauVsx9FEgnsourD8DELwCUQ\n`;
    expect(parseOfacList(usdt, { skipNonEvm: true })).toEqual([hex40('d')]);
    expect(() => parseOfacList(`${usdt}0xdeadbeef\n`, { skipNonEvm: true })).toThrow(/line 4/);
  });
});

describe('the OFAC list files', () => {
  it('reads every EVM-format asset tag from the lists branch of the nightly SDN extract', () => {
    expect(OFAC_LIST_FILES.map((f) => f.asset)).toEqual(['ETH', 'ETC', 'ARB', 'BSC', 'USDC', 'USDT']);
    expect(ofacListUrl('ETH')).toBe(
      'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt',
    );
  });
});

describe('the bundled OFAC snapshot', () => {
  it('holds only lowercased, unique, sorted 0x addresses', () => {
    const list = OFAC_SNAPSHOT.addresses;
    expect(list.length).toBeGreaterThanOrEqual(100);
    for (const a of list) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort()).toEqual(list);
  });

  it('records where and when it was fetched', () => {
    expect(OFAC_SNAPSHOT.source).toBe('https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses');
    expect(OFAC_SNAPSHOT.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('renders back to the same file the update script writes', () => {
    const src = renderOfacSnapshot(OFAC_SNAPSHOT.addresses, OFAC_SNAPSHOT.fetched_at);
    expect(src).toContain('https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses');
    expect(src).toContain(`Fetched: ${OFAC_SNAPSHOT.fetched_at}`);
    for (const a of OFAC_SNAPSHOT.addresses) expect(src).toContain(`'${a}',`);
  });
});

describe('isSanctioned', () => {
  it('matches a listed address in any letter case', () => {
    expect(isSanctioned(LAZARUS)).toBe(true);
    expect(isSanctioned(LAZARUS.toLowerCase())).toBe(true);
    expect(isSanctioned(LAZARUS.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('matches an address listed only under a non-ETH EVM tag', () => {
    expect(isSanctioned(BSC_TAGGED)).toBe(true);
  });

  it('does not match an ordinary address or junk input', () => {
    expect(isSanctioned(NORMAL)).toBe(false);
    expect(isSanctioned('')).toBe(false);
    expect(isSanctioned('not an address')).toBe(false);
  });
});
