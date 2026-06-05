// packages/indexer/src/scout/__tests__/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { recoverDecodedNames, isDecoded } from '../dedup.js';

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
