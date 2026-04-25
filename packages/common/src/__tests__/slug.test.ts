import { describe, it, expect } from 'vitest';
import { agentSlug } from '../slug.js';

describe('agentSlug', () => {
  it('lowercases and dasherizes a clean name', () => {
    expect(agentSlug('AIXBT', '0xabc')).toBe('aixbt');
  });

  it('strips diacritics and special chars', () => {
    expect(agentSlug('Étoile! @Agent v2', '0xabc')).toBe('etoile-agent-v2');
  });

  it('collapses whitespace and runs of dashes', () => {
    expect(agentSlug('  Wasa   bot  --  v1 ', '0xabc')).toBe('wasa-bot-v1');
  });

  it('falls back to short wallet hash when name is empty/null', () => {
    expect(agentSlug(null, '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
    expect(agentSlug('', '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
  });

  it('appends short wallet hash when name slug would be empty (only special chars)', () => {
    expect(agentSlug('!!!', '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825')).toBe('agent-4f9fd6be');
  });

  it('truncates very long names to 60 chars max', () => {
    const long = 'a'.repeat(120);
    expect(agentSlug(long, '0xabc')).toBe('a'.repeat(60));
  });

  it('does not produce a trailing dash when slice(60) cuts mid-dash-run', () => {
    // 'a'×59 + '!' + 'a' → after lower+replace: 'a'×59 + '-' + 'a'
    // slice(60) gives 'a'×59 + '-' (ends in dash). Old code returns this.
    // New code trims after slice, returning 'a'×59.
    const input = 'a'.repeat(59) + '!a';
    expect(agentSlug(input, '0xabc')).toBe('a'.repeat(59));
  });
});
