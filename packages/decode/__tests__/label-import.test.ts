import { describe, expect, it } from 'vitest';
import { checkLabel, datasetLabels, labelsFromCsv, parseCsv, type LabelRecord } from '../src/label-import.js';

// Getting labels in: a CSV (tips go in this way, private), and the published datasets.
// Every label is checked before it is written: a public label needs a public source and
// can never come from a tip, and the sentence follows the wording rules.

const A = `0x${'a'.repeat(40)}`;
const B = `0x${'b'.repeat(40)}`;

const ok: LabelRecord = {
  chain: 'base',
  address: A,
  kind: 'run_together',
  strength: 'strong',
  visibility: 'private',
  group_key: 'predictex-tree-1',
  group_size: 3,
  sentence: 'One of 3 wallets that appear to be run together in PredictEX referrals, from our note to PredictEX.',
  source_type: 'tip',
  source_ref: 'predictex-2026-10-20',
  source_url: null,
  evidence_url: 'https://basescan.org/tx/0x1',
  as_of: '2026-10-20',
  note: null,
  expires_at: null,
};

describe('parseCsv', () => {
  it('reads quoted fields with commas and doubled quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('ignores a trailing newline and CRLF line ends', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('checkLabel', () => {
  it('passes a private label from a tip', () => {
    expect(checkLabel(ok)).toEqual([]);
  });

  it('refuses a public label from a tip', () => {
    expect(checkLabel({ ...ok, visibility: 'public', source_url: 'https://chainward.ai/x' })).toContain('a label from a tip is private');
  });

  it('refuses a public label with no public source link', () => {
    expect(checkLabel({ ...ok, visibility: 'public', source_type: 'decode' })).toContain('a public label needs a public source link');
  });

  it.each([
    ['a bad address', { address: '0x12' }, 'address'],
    ['an unknown chain', { chain: 'eth' }, 'chain'],
    ['an unknown kind', { kind: 'scammer' as never }, 'kind'],
    ['a bad date', { as_of: '20 Oct' }, 'as_of'],
    ['a date that does not exist', { as_of: '2026-13-45' }, 'as_of'],
    ['an empty sentence', { sentence: ' ' }, 'sentence'],
    ['an accusing word', { sentence: 'A known scam wallet.' }, 'sentence'],
    ['an em dash', { sentence: 'One of 3 wallets — run together.' }, 'sentence'],
    ['a group size that is not a whole number', { group_size: 2.5 }, 'group_size'],
  ])('refuses %s', (_case, over, field) => {
    expect(checkLabel({ ...ok, ...over }).join(' ')).toMatch(new RegExp(field));
  });
});

describe('labelsFromCsv', () => {
  const header = 'address,chain,kind,strength,group_key,group_size,sentence,evidence_url,as_of,note';
  const source = { visibility: 'private' as const, source_type: 'tip' as const, source_ref: 'predictex-2026-10-20', source_url: null };

  it('reads each row with the source given, lowercasing addresses', () => {
    const csv = `${header}\n${A.toUpperCase().replace('0X', '0x')},base,run_together,strong,t1,3,"One of 3 wallets that appear to be run together in PredictEX referrals, from our note.",https://basescan.org/tx/0x1,2026-10-20,\n`;
    const { labels, errors } = labelsFromCsv(csv, source);
    expect(errors).toEqual([]);
    expect(labels).toEqual([expect.objectContaining({ address: A, group_size: 3, source_type: 'tip', visibility: 'private', note: null })]);
  });

  it('names the line of each bad row and keeps none of the file', () => {
    const csv = `${header}\n${A},base,run_together,strong,,,"fine sentence.",,2026-10-20,\n0x12,base,run_together,strong,,,"bad address.",,2026-10-20,\n`;
    const { labels, errors } = labelsFromCsv(csv, source);
    expect(labels).toEqual([]);
    expect(errors[0]).toMatch(/^line 3: address/);
  });

  it('refuses a file without the expected columns', () => {
    expect(labelsFromCsv('address,kind\n', source).errors[0]).toMatch(/missing columns: chain/);
  });

  // labels:screen prints private labels with their visibility and source: that file must never come back in.
  it('refuses a file that carries visibility or source columns, as screen output does', () => {
    const screen = `\uFEFF${header},visibility,source_type\n${A},base,run_together,strong,,,"x.",,2026-10-20,,private,tip\n`;
    expect(labelsFromCsv(screen, { ...source, visibility: 'public', source_type: 'decode', source_url: 'https://chainward.ai/x' }).errors[0]).toMatch(
      /screen output/,
    );
  });

  it('refuses the same address, chain and kind twice in one file', () => {
    const row = `${A},base,run_together,strong,,,"One of 3 wallets.",,2026-10-20,`;
    const { errors } = labelsFromCsv(`${header}\n${row}\n${row}\n`, source);
    expect(errors[0]).toMatch(/^line 3: same address, chain and kind as line 2/);
  });

  it('reads a sentence with a line break inside quotes', () => {
    const { labels, errors } = labelsFromCsv(`${header}\n${A},base,run_together,strong,,,"One of 3\nwallets.",,2026-10-20,\n`, source);
    expect(errors).toEqual([]);
    expect(labels[0]!.sentence).toBe('One of 3\nwallets.');
  });
});

describe('datasetLabels', () => {
  // The free lookup shows the tier, not the cluster: a public label says only what is public.
  it('labels TermiX tier A1 strong and A2 weak, as hiring loops, without the paid cluster field; other tiers not at all', () => {
    const rows = [
      { chain: 'base', address: A, tier: 'A1', fields: { cluster: 'S0010' } },
      { chain: 'bsc', address: B, tier: 'A1', fields: { cluster: 'S0010' } },
      { chain: 'base', address: `0x${'c'.repeat(40)}`, tier: 'A2', fields: { cluster: 'S0099' } },
      { chain: 'base', address: `0x${'d'.repeat(40)}`, tier: 'B', fields: { cluster: 'S0100' } },
    ];
    const labels = datasetLabels('termix-wallets', rows);
    expect(labels).toHaveLength(3);
    expect(labels[0]).toMatchObject({ kind: 'hiring_loop', strength: 'strong', group_key: 'termix:A1', group_size: 2, visibility: 'public', source_type: 'dataset', source_ref: 'termix-wallets', source_url: 'https://chainward.ai/decodes/termix-on-chain', as_of: '2026-09-29' });
    expect(labels[0]!.sentence).toBe('One of 2 TermiX wallets that hire each other, each with a direct on-chain link to another participant, from our TermiX decode.');
    expect(JSON.stringify(labels)).not.toMatch(/S0010/);
    expect(labels[2]).toMatchObject({ strength: 'weak', group_key: null });
    for (const l of labels) expect(checkLabel(l)).toEqual([]);
  });

  // Group membership is a field of the paid file (the free lookup shows only the tier): private until published.
  it("labels Set and Earn's 48- and 14-wallet hiring groups, privately, and nobody else", () => {
    const rows = [
      { chain: 'bsc', address: A, tier: 'A2', fields: { in_48_wallet_group: true, in_14_wallet_group: false } },
      { chain: 'bsc', address: B, tier: 'A2', fields: { in_48_wallet_group: false, in_14_wallet_group: true } },
      { chain: 'bsc', address: `0x${'c'.repeat(40)}`, tier: 'A2', fields: { in_48_wallet_group: false, in_14_wallet_group: false } },
    ];
    const labels = datasetLabels('set-and-earn-week-one', rows);
    expect(labels.map((l) => [l.address, l.group_key, l.group_size])).toEqual([
      [A, 'set-and-earn:48', 48],
      [B, 'set-and-earn:14', 14],
    ]);
    expect(labels[0]!.sentence).toBe("One of 48 wallets that hire only each other's agents in BNB Chain's Set and Earn, from our Set and Earn decode.");
    expect(labels.every((l) => l.visibility === 'private' && l.kind === 'hiring_loop')).toBe(true);
    expect(labels[0]!.evidence_url).toMatch(/^https:\/\/bscscan\.com\/tx\//);
    for (const l of labels) expect(checkLabel(l)).toEqual([]);
  });

  it('knows no other dataset', () => {
    expect(() => datasetLabels('x402-sellers-base', [])).toThrow(/no label mapping/);
  });
});
