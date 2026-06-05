// packages/indexer/src/scout/__tests__/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { recoverDecodedNames, isDecoded, recoverDecodedAddresses, decodeBodyText, isCoveredByName } from '../dedup.js';

describe('dedup — decoded-name recovery from frontmatter (NOT slugify-dirname)', () => {
  it('recovers agent name token from a frontmatter title, stripping decode suffixes', () => {
    const md = '---\ntitle: "Wasabot On-Chain Decode"\nslug: wasabot-decode\n---\nbody';
    const names = recoverDecodedNames([{ dir: 'wasabot-decode', file: 'decode.md', content: md }]);
    expect(names.has('wasabot')).toBe(true);
  });

  it('handles AIXBT-style title', () => {
    const md = '---\ntitle: "AIXBT On-Chain Decode"\n---\n';
    const names = recoverDecodedNames([{ dir: 'aixbt', file: 'decode.md', content: md }]);
    expect(names.has('aixbt')).toBe(true);
  });

  it('ignores non-decode helper files (no title match)', () => {
    const md = '## checklist\n- a';
    const names = recoverDecodedNames([{ dir: 'wasabot-decode', file: 'publish-checklist.md', content: md }]);
    expect(names.size).toBe(0);
  });

  it('isDecoded matches case-insensitively on the agent name token', () => {
    const set = new Set(['wasabot', 'aixbt']);
    expect(isDecoded('Wasabot', set)).toBe(true);
    expect(isDecoded('Otto', set)).toBe(false);
  });

  it('isDecoded matches a decorated name via its first token', () => {
    expect(isDecoded('AIXBT Agent', new Set(['aixbt']))).toBe(true);
  });

  it('isDecoded matches a name with an emoji suffix via its first token', () => {
    expect(isDecoded('Wasabot 🍣', new Set(['wasabot']))).toBe(true);
  });

  it('isDecoded still matches a multi-word token via the full name', () => {
    expect(isDecoded('Ethy AI', new Set(['ethy ai']))).toBe(true);
  });

  it('isDecoded returns false when neither token nor full name matches', () => {
    expect(isDecoded('Otto', new Set(['aixbt']))).toBe(false);
  });
});

describe('dedup — address recovery from PUBLISHED decode articles (decode.md only)', () => {
  it('extracts an address from a decode.md and lowercases it', () => {
    const addrs = recoverDecodedAddresses([
      { dir: 'live-leaderboard-2026-04', file: 'decode.md', content: '| Otto AI (main) | `0x5bB4B0C766E0D5D791d9403Fc275c22064709F68` | x |' },
    ]);
    expect(addrs.has('0x5bb4b0c766e0d5d791d9403fc275c22064709f68')).toBe(true);
  });

  it('ignores addresses in non-decode.md files (e.g. identity-chain.md)', () => {
    const addrs = recoverDecodedAddresses([
      { dir: 'axelrod-on-chain', file: 'identity-chain.md', content: '0x1111111111111111111111111111111111111111' },
    ]);
    expect(addrs.size).toBe(0);
  });

  it('collects multiple addresses from one decode.md, lowercased', () => {
    const addrs = recoverDecodedAddresses([
      {
        dir: 'live-leaderboard-2026-04',
        file: 'decode.md',
        content:
          '| Otto | `0x5bB4B0C766E0D5D791d9403Fc275c22064709F68` |\n| Axelrod | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` |',
      },
    ]);
    expect(addrs.size).toBe(2);
    expect(addrs.has('0x5bb4b0c766e0d5d791d9403fc275c22064709f68')).toBe(true);
    expect(addrs.has('0x999a1b6033998a05f7e37e4bd471038df46624e1')).toBe(true);
  });

  it('regression: Otto (covered inside the leaderboard decode.md) is treated as covered by address', () => {
    const candidateWallet = '0x5bB4B0C766E0D5D791d9403Fc275c22064709F68';
    const addrs = recoverDecodedAddresses([
      {
        dir: 'live-leaderboard-2026-04',
        file: 'decode.md',
        content: '| Otto AI (main) | `0x5bB4B0C766E0D5D791d9403Fc275c22064709F68` | Self-custody EOA | 30,802 |',
      },
    ]);
    expect(addrs.has(candidateWallet.toLowerCase())).toBe(true);
  });

  it('also extracts addresses from publish-checklist.md, lowercased', () => {
    const addrs = recoverDecodedAddresses([
      {
        dir: 'acp-leaderboard-audit',
        file: 'publish-checklist.md',
        content: '- [ ] verify Degen Claw 0xd478a8B40372db16cA8045F28C6FE07228F3781A',
      },
    ]);
    expect(addrs.has('0xd478a8b40372db16ca8045f28c6fe07228f3781a')).toBe(true);
  });

  it('regression: Degen Claw full address (only in publish-checklist.md) is treated as covered', () => {
    const candidateWallet = '0xd478a8B40372db16cA8045F28C6FE07228F3781A';
    const addrs = recoverDecodedAddresses([
      { dir: 'acp-leaderboard-audit', file: 'decode.md', content: 'Finding 5: Degen Claw revenue anomaly (0xd478...781A)' },
      { dir: 'acp-leaderboard-audit', file: 'publish-checklist.md', content: 'full: 0xd478a8B40372db16cA8045F28C6FE07228F3781A' },
    ]);
    expect(addrs.has(candidateWallet.toLowerCase())).toBe(true);
  });
});

describe('dedup — name-in-body coverage for multi-agent decodes', () => {
  it('decodeBodyText only includes decode.md, lowercased, checklist excluded', () => {
    const text = decodeBodyText([
      { dir: 'a', file: 'decode.md', content: 'Hello World' },
      { dir: 'a', file: 'publish-checklist.md', content: 'Secret' },
    ]);
    expect(text).toBe('hello world');
  });

  it('isCoveredByName matches a distinctive name appearing in a decode body', () => {
    expect(isCoveredByName('Degen Claw', 'finding 5: the degen claw revenue anomaly')).toBe(true);
  });

  it('isCoveredByName returns false when the name is absent', () => {
    expect(isCoveredByName('Degen Claw', 'no mention here')).toBe(false);
  });

  it('isCoveredByName requires a whole-word match (prefix does not count)', () => {
    expect(isCoveredByName('Capmin', 'see capminal stats')).toBe(false);
    expect(isCoveredByName('Capmin', 'the capmin agent')).toBe(true);
  });

  it('isCoveredByName ignores short generic names (<5 chars)', () => {
    expect(isCoveredByName('AI', 'ai everywhere ai')).toBe(false);
  });
});
