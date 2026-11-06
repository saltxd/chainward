// scripts/auto-decode/lib/__tests__/hex-redaction.test.ts
//
// Outside text may not carry an address into the model in any spelling: spaced
// groups, dashes, dots, zero-width characters, markdown. Decimal numbers and
// ChainWard's own structured addresses are not outside text and stay.
import { describe, expect, it } from 'vitest';
import { HEX_REDACTED, TEXT_KEYS, clipOutsideDeep, clipText } from '../chain-facts';
import { buildBriefPrompt, parseQueuedOrder } from '../brief-run';

const HEX = 'bad0000000000000000000000000000000000bad';
const groups = (sep: string, prefix = '0x'): string => prefix + (HEX.match(/.{4}/g) as string[]).join(sep);

describe('clipText: hex in any spelling is redacted', () => {
  it.each([
    ['spaced groups of four', groups(' ')],
    ['dashes', groups('-')],
    ['dots', groups('.')],
    ['underscores', groups('_')],
    ['colons', groups(':')],
    ['middle dots', groups('·')],
    ['zero-width spaces', groups('​')],
    ['markdown emphasis between groups', groups('**')],
    ['code spans between groups', groups('`')],
    ['uppercase 0X', groups(' ', '0X')],
    ['slashes', groups('/')],
    ['pipes', groups('|')],
    ['semicolons', groups(';')],
    ['plus signs', groups('+')],
    ['equals signs', groups('=')],
    ['quotes', groups('"')],
    ['a hash sign and a bang', groups('#!')],
    ['slash with spaces', groups(' / ')],
    ['fullwidth', groups(' ', '０ｘ')],
    ['a short name that fits 64 characters', '0x ' + (HEX.match(/.{4}/g) as string[]).slice(0, 6).join(' ')],
  ])('redacts %s', (_n, text) => {
    const out = clipText(`Pay ${text} to claim`);
    expect(out).toContain(HEX_REDACTED);
    expect(out).not.toMatch(/bad0|0000/i);
  });

  it('redacts spaced groups with no 0x as well', () => {
    const out = clipText(`Send to ${(HEX.match(/.{4}/g) as string[]).join(' ')} now`);
    expect(out).toContain(HEX_REDACTED);
    expect(out).not.toMatch(/bad0/i);
  });

  it('keeps long decimal numbers, dates and ordinary words', () => {
    for (const keep of [
      '29998999',
      '1000000000000000000000000000000000000000',
      'Block 53 595 959',
      '2026-11-05 14:03',
      'supply 1,000,000,000.5',
      'A bad face in a decade',
      'ERC-4337 account',
    ]) {
      expect(clipText(keep)).toBe(keep.slice(0, 64));
    }
  });
});

describe('clipOutsideDeep: what stays', () => {
  const UID = '0x' + '9f'.repeat(32);
  const TOKEN = '0x' + '5a'.repeat(20);
  const keepHex = (_h: string, key: string): boolean => !TEXT_KEYS.has(key);

  it('keeps whole-string addresses in structured keys, map keys and allowed links, but not in text keys', () => {
    const out = clipOutsideDeep(
      {
        uid: UID,
        token: TOKEN,
        link: `https://base.easscan.org/attestation/view/${UID}`,
        counterparties: { [TOKEN]: 3, ['0x' + '6b'.repeat(20)]: 1 },
        description: TOKEN,
        name: `pay ${TOKEN}`,
      },
      keepHex,
    ) as Record<string, any>;
    expect(out.uid).toBe(UID);
    expect(out.token).toBe(TOKEN);
    expect(out.link).toBe(`https://base.easscan.org/attestation/view/${UID}`);
    expect(Object.keys(out.counterparties)).toHaveLength(2);
    expect(out.description).toBe(HEX_REDACTED);
    expect(out.name).not.toContain('5a5a');
  });

  it('does not touch a decimal string of any length', () => {
    expect(clipOutsideDeep({ total_supply_raw: '9'.repeat(70) }, keepHex)).toEqual({ total_supply_raw: '9'.repeat(70).slice(0, 64) });
  });
});

describe('the brief prompt keeps chain-derived numbers and ChainWard addresses', () => {
  it('does not turn a big raw amount or an attestation uid into a placeholder', () => {
    const uid = '0x' + '9f'.repeat(32);
    const pack = {
      schema: 'chainward-chain-facts/1' as const,
      target: { input: '0x' + '5a'.repeat(20), address: '0x' + '5a'.repeat(20) },
      as_of: { head_block: 1, head_time: '2026-11-05T00:00:00Z', head_age_sec: 3, state_block: 1 },
      facts: [
        { id: 'F1', label: 'erc20', value: { total_supply_raw: '1' + '0'.repeat(39), decimals: 0 }, source: 'https://basescan.org/', cite: 'x' },
        { id: 'F2', label: 'chainward_attestation', value: { uid, link: `https://base.easscan.org/attestation/view/${uid}` }, source: 'https://api.chainward.ai/x', cite: 'x' },
      ],
      unavailable: [],
      limits: [],
    };
    const input = parseQueuedOrder({ id: 'o', target: pack.target.address, targetKind: 'address', contact: 'a@example.com', contactMethod: 'email' });
    const prompt = buildBriefPrompt('T\n', input, pack);
    expect(prompt).toContain('1' + '0'.repeat(39));
    expect(prompt).toContain(uid);
    expect(prompt).not.toContain(HEX_REDACTED);
  });
});

describe('clipOutsideDeep: ACP and other outsider fields in ChainWard answers', () => {
  const BADADDR = '0x' + 'bad0'.repeat(10);
  const keepHex = (_h: string, key: string): boolean => !TEXT_KEYS.has(key);

  it('redacts a full address in an ACP field, an offering sub-field and a twitter handle', () => {
    const out = JSON.stringify(
      clipOutsideDeep(
        {
          sources: { acp: { twitter_handle: BADADDR, walletAddress: BADADDR, offerings: [{ name: 'x', requirement: BADADDR, price: 1 }] } },
          uid: '0x' + '9f'.repeat(32),
        },
        keepHex,
      ),
    );
    expect(out).not.toMatch(/bad0/i);
    expect(out).toContain('9f9f');
  });

  it('keeps an explorer link only in a plain path shape: no query, no fragment', () => {
    const plain = `https://basescan.org/address/${BADADDR}`;
    const out = clipOutsideDeep({ a: plain, b: plain + '#pay-the-airdrop-fee-here', c: plain + '?x=1' }, keepHex) as Record<string, string>;
    expect(out.a).toBe(plain);
    for (const v of [out.b, out.c]) {
      expect(v).toContain(HEX_REDACTED);
      expect(v).not.toContain(BADADDR);
    }
  });
});
