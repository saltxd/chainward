import { describe, expect, it } from 'vitest';
import { getAllDecodes, getDecodeBySlug, plainCallout, stripLeadingTitle } from '../decodes';

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

// Decodes are written for researchers; the box at the top says what the finding
// means for someone about to pay or hire an agent, in words anyone can follow.
describe('plainCallout', () => {
  const base = { title: 'T', subtitle: 'S', date: '2026-10-10', slug: 's' };

  it('is absent when the decode has no plain summary', () => {
    expect(plainCallout(base)).toBeNull();
    expect(plainCallout({ ...base, plain: '   ' })).toBeNull();
  });

  it('points at the address check by default', () => {
    expect(plainCallout({ ...base, plain: ' Most of it loops. ' })).toEqual({
      text: 'Most of it loops.',
      href: '/',
      cta: 'Paste an address: should you pay it? →',
    });
  });

  it('takes its own link and label, but only to a page on this site', () => {
    expect(plainCallout({ ...base, plain: 'x', plainHref: '/set-and-earn', plainCta: 'Look it up →' })).toMatchObject({
      href: '/set-and-earn',
      cta: 'Look it up →',
    });
    expect(plainCallout({ ...base, plain: 'x', plainHref: 'https://evil.example' })?.href).toBe('/');
    expect(plainCallout({ ...base, plain: 'x', plainHref: '//evil.example' })?.href).toBe('/');
  });

  it('is written for every published decode, short and without em dashes', () => {
    const all = getAllDecodes();
    expect(all.length).toBeGreaterThan(20);
    for (const d of all) {
      const full = getDecodeBySlug(d.slug);
      const box = full && plainCallout(full.meta);
      expect(box, d.slug).toBeTruthy();
      expect(box!.text.length, d.slug).toBeLessThanOrEqual(330);
      expect(box!.text, d.slug).not.toContain('—');
    }
  });
});

describe('decode.md is preferred over other markdown in the same directory', () => {
  it('finds axelrod-on-chain, whose dir also holds correction-proposal.md', () => {
    const all = getAllDecodes();
    const slugs = all.map((d) => d.slug);
    // correction-proposal.md sorts before decode.md. When the glob took the
    // first file, this decode parsed with no slug and 404'd in production
    // while the API still listed it.
    expect(slugs).toContain('axelrod-on-chain');
  });

  it('every deliverable with a decode.md resolves to a slug matching its directory', () => {
    const all = getAllDecodes();
    for (const d of all) {
      expect(d.slug).toBeTruthy();
    }
  });
});
