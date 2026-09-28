import { describe, expect, it } from 'vitest';
import { stripLeadingTitle } from '../decodes';

describe('stripLeadingTitle', () => {
  it('drops a leading h1 and the blank lines after it', () => {
    expect(stripLeadingTitle('\n# The Title\n\nFirst paragraph.\n')).toBe('First paragraph.\n');
  });

  it('keeps content that opens with an h2', () => {
    const md = '## TLDR\n\nText.\n';
    expect(stripLeadingTitle(md)).toBe(md);
  });

  it('only strips the first heading, and only at the start', () => {
    const md = 'Intro.\n\n# Later heading\n';
    expect(stripLeadingTitle(md)).toBe(md);
    expect(stripLeadingTitle('# A\n\n# B\n')).toBe('# B\n');
  });
});
