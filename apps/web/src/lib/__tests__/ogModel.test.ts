import { describe, expect, it } from 'vitest';
import type { RiskReport } from '../api';
import { clip, decodeCard, reportCard, shortAddress, stampLines, typeset } from '../og/model';

// What a share card says: the answer word as a stamp, the address, the one reason,
// the chain. Too little to judge gets its own word, never a band label.

const NOW = new Date('2026-10-11T18:00:00Z');
const ADDRESS = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

function report(over: Partial<RiskReport> & { window?: Partial<NonNullable<RiskReport['coverage']>['window']> } = {}): RiskReport {
  const { window, ...rest } = over;
  return {
    address: ADDRESS,
    chain: 'base',
    band: 'low-signal',
    flags: [],
    not_assessed: [],
    freshness: { as_of_block: 1, generated_at: '2026-10-11T17:00:00Z', ttl_state: 'fresh' },
    coverage: {
      checks: [],
      window: {
        transfers_scanned: 242,
        transfers_truncated: false,
        transfers_30d: 242,
        unique_counterparties_30d: 10,
        latest_transfer_at: '2026-10-11T15:00:00Z',
        sent_tx_count: 117,
        wallet_type: 'eoa',
        survival: 'active',
        ...window,
      },
    },
    classifier_version: '1',
    view_count: 0,
    disclaimer: '',
    ...rest,
  } as RiskReport;
}

describe('shortAddress', () => {
  it('keeps the first 6 and last 4 characters, like the page title', () => {
    expect(shortAddress(ADDRESS)).toBe('0x4baa…3bb2');
  });
});

describe('clip', () => {
  it('leaves short text alone and tidies whitespace', () => {
    expect(clip('  Nothing   recent to go on. ', 80)).toBe('Nothing recent to go on.');
  });

  it('cuts long text at a word boundary and ends it with an ellipsis', () => {
    const out = clip(
      'Its 2,000 transfers in the last 30 days all went to or from just 3 wallets, every one of them funded by the owner.',
      60,
    );
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toBe('Its 2,000 transfers in the last 30 days all went to or from…');
  });

  it('drops dangling punctuation before the ellipsis', () => {
    expect(clip('One two three, four five six seven eight', 18)).toBe('One two three…');
  });
});

describe('typeset', () => {
  it('turns straight quotes into printed ones', () => {
    expect(typeset("Don't pay yet. The 'Clanker Hook' tokens aren't it.")).toBe('Don’t pay yet. The ‘Clanker Hook’ tokens aren’t it.');
  });
});

describe('stampLines', () => {
  it('keeps a short word on one line', () => {
    expect(stampLines('Pay')).toEqual(['Pay']);
    expect(stampLines('Inactive')).toEqual(['Inactive']);
  });

  it('breaks a long answer over two lines at the middle space', () => {
    expect(stampLines('No track record')).toEqual(['No track', 'record']);
    expect(stampLines("Couldn't check")).toEqual(["Couldn't", 'check']);
  });
});

describe('reportCard', () => {
  it('Pay: a green stamp with the activity behind it', () => {
    const c = reportCard(report({ verdict: { label: 'pay', text: 'Pay', reason: 'Active.', limits: '' } }), ADDRESS, 'Base', NOW);
    expect(c).toMatchObject({
      kind: 'answer',
      tone: 'pay',
      word: 'Pay',
      short: '0x4baa…3bb2',
      chainName: 'Base',
      headline: 'Nothing we can see says don’t.',
      reason: '242 transfers with 10 different wallets in the last 30 days, the last one 3 hours ago.',
    });
  });

  it('Hold: names the reason from the top flag', () => {
    const c = reportCard(
      report({
        verdict: { label: 'hold', text: 'Hold', reason: 'Dormant.', limits: '' },
        flags: [{ id: 'dormant_wallet', severity: 'medium', title: 'Wallet is dormant', evidence: '', source: '' }],
      }),
      ADDRESS,
      'BNB Chain',
      NOW,
    );
    expect(c).toMatchObject({
      kind: 'answer',
      tone: 'hold',
      word: 'Hold',
      chainName: 'BNB Chain',
      reason: 'This wallet hasn’t moved any tokens in the last 30 days.',
    });
  });

  it('too little to judge: says which case, never "Unknown"', () => {
    const c = reportCard(
      report({
        verdict: { label: 'unknown', text: 'Unknown', reason: 'No transfers.', limits: '' },
        window: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null, sent_tx_count: 43 },
      }),
      ADDRESS,
      'Base',
      NOW,
    );
    expect(c).toMatchObject({ kind: 'answer', tone: 'unknown', word: 'Inactive' });
  });

  it('clips a long reason so it fits the card', () => {
    const long = `Funded by one wallet: ${'every transfer went through the same exchange deposit address again and again '.repeat(4)}`;
    const c = reportCard(report({ verdict: { label: 'hold', text: 'Hold', reason: long, limits: '' } }), ADDRESS, 'Base', NOW);
    expect(c.kind).toBe('answer');
    if (c.kind !== 'answer') return;
    expect(c.reason.length).toBeLessThanOrEqual(160);
    expect(c.reason.endsWith('…')).toBe(true);
  });

  it('no report yet: asks the question instead of answering it', () => {
    expect(reportCard(null, ADDRESS, 'Base', NOW)).toEqual({ kind: 'ask', short: '0x4baa…3bb2', chainName: 'Base' });
  });

  it('a report filed before verdicts existed also gets the question, not a band', () => {
    expect(reportCard(report({ band: 'high-signal' }), ADDRESS, 'Base', NOW)).toEqual({
      kind: 'ask',
      short: '0x4baa…3bb2',
      chainName: 'Base',
    });
  });
});

describe('decodeCard', () => {
  const meta = {
    title: 'Six x402 Wallets Paid Only by Each Other Now Rank 3 to 8 on Base',
    subtitle: 'The six wallets from our two earlier x402 decodes have moved $981K between them.',
    date: '2026-10-09',
    slug: 'x402-closed-six',
  };

  it('dates the decode by its calendar day, whatever the local time zone', () => {
    expect(decodeCard(meta).dateLabel).toBe('October 9, 2026');
  });

  it('links the decode and keeps its title and subtitle', () => {
    const c = decodeCard(meta);
    expect(c.url).toBe('chainward.ai/decodes/x402-closed-six');
    expect(c.title).toBe(meta.title);
    expect(c.subtitle).toBe(meta.subtitle);
    expect(decodeCard({ ...meta, title: "Bankr's 14-Wallet Hack" }).title).toBe('Bankr’s 14-Wallet Hack');
  });

  it('sets long titles smaller so they fit', () => {
    const mid = decodeCard(meta).titleSize;
    expect(decodeCard({ ...meta, title: 'Axelrod On-Chain Decode' }).titleSize).toBeGreaterThan(mid);
    expect(
      decodeCard({ ...meta, title: "Set and Earn's First Full Week: 20 Agents Clear Our Hire Check, 16 of Them in One Ring" })
        .titleSize,
    ).toBeLessThan(mid);
  });

  it('clips a long subtitle', () => {
    const c = decodeCard({ ...meta, subtitle: 'word '.repeat(80) });
    expect(c.subtitle.length).toBeLessThanOrEqual(190);
    expect(c.subtitle.endsWith('…')).toBe(true);
  });
});
