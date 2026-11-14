import { describe, expect, it } from 'vitest';
import {
  articleJsonLd,
  getAllDecodes,
  getDecodeBySlug,
  jsonLdScript,
  plainCallout,
  searchDescription,
  stripLeadingTitle,
} from '../decodes';

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

// Search results show the meta description. The subtitle is a headline deck; the
// plain summary says what the finding means, which is what a searcher wants to know.
describe('searchDescription', () => {
  const base = { title: 'T', subtitle: 'The subtitle.', date: '2026-10-10', slug: 's' };

  it('prefers the plain summary', () => {
    expect(searchDescription({ ...base, plain: 'Most of it loops.' })).toBe('Most of it loops.');
  });

  it('falls back to the subtitle when there is no plain summary', () => {
    expect(searchDescription(base)).toBe('The subtitle.');
    expect(searchDescription({ ...base, plain: '  \n ' })).toBe('The subtitle.');
  });

  it('collapses whitespace', () => {
    expect(searchDescription({ ...base, plain: '  Most  of it\n\nloops. \t' })).toBe('Most of it loops.');
  });

  it('strips markdown links and emphasis down to their text', () => {
    const plain =
      'See [the check](/rugcheck), **bold**, *soft*, _under_, `code` and ~~old~~ but keep snake_case_name.';
    expect(searchDescription({ ...base, plain })).toBe(
      'See the check, bold, soft, under, code and old but keep snake_case_name.',
    );
  });

  it('keeps text of exactly 160 characters', () => {
    const plain = `${'word '.repeat(31)}abcd.`;
    expect(plain).toHaveLength(160);
    expect(searchDescription({ ...base, plain })).toBe(plain);
  });

  it('cuts long text at the last sentence end that leaves at least 80 characters', () => {
    const first = `${'a'.repeat(60)} first sentence ends here.`;
    const second = ` Second sentence ${'b'.repeat(30)} also ends.`;
    const plain = `${first}${second} Third sentence runs on well past the limit of the snippet length for sure.`;
    expect(plain.length).toBeGreaterThan(160);
    expect(searchDescription({ ...base, plain })).toBe(`${first}${second}`);
  });

  it('cuts at a word with an ellipsis when no sentence end leaves 80 characters', () => {
    const plain = `Short one. ${'lorem ipsum dolor '.repeat(12)}end.`;
    const out = searchDescription({ ...base, plain });
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    expect(out.endsWith(' …')).toBe(false);
    expect(plain.startsWith(out.slice(0, -1))).toBe(true);
    expect(plain[out.length - 1]).toBe(' ');
  });

  it('never cuts inside a word', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliett'];
    for (let shift = 0; shift < 12; shift++) {
      const plain = `${'x'.repeat(shift)} ${Array.from({ length: 40 }, (_, i) => words[i % words.length]).join(' ')}`;
      const kept = searchDescription({ ...base, plain }).slice(0, -1).split(' ');
      const source = plain.trim().split(' ');
      expect(kept, String(shift)).toEqual(source.slice(0, kept.length));
    }
  });

  it('every published decode gets a snippet of at most 160 characters', () => {
    for (const d of getAllDecodes()) {
      const text = searchDescription(d);
      expect(text, d.slug).toBeTruthy();
      expect(text.length, d.slug).toBeLessThanOrEqual(160);
    }
  });
});

describe('articleJsonLd', () => {
  const meta = {
    title: 'Who really pays the agent',
    subtitle: 'A deck.',
    date: '2026-10-29',
    slug: 'who-pays',
    plain: 'Most of the volume loops back.',
  };
  const image = 'https://chainward.ai/decodes/who-pays/og.png';

  it('describes the decode as a schema.org Article', () => {
    const chainward = { '@type': 'Organization', name: 'ChainWard', url: 'https://chainward.ai' };
    expect(articleJsonLd(meta, 'who-pays', image)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Who really pays the agent',
      description: 'Most of the volume loops back.',
      datePublished: '2026-10-29T00:00:00.000Z',
      image,
      mainEntityOfPage: 'https://chainward.ai/decodes/who-pays',
      author: chainward,
      publisher: chainward,
    });
  });

  it('accepts the Date gray-matter parses a bare YAML date into', () => {
    const date = new Date('2026-10-29T00:00:00Z') as unknown as string;
    expect(articleJsonLd({ ...meta, date }, 'who-pays', image).datePublished).toBe('2026-10-29T00:00:00.000Z');
  });

  it('caps the headline at 110 characters at a word boundary', () => {
    const title = `${'Agents '.repeat(20)}end`;
    const { headline } = articleJsonLd({ ...meta, title }, 'who-pays', image);
    expect(headline.length).toBeLessThanOrEqual(110);
    expect(headline).toMatch(/^(Agents )+Agents…$/);
  });

  it('serializes so a title can never close the script tag', () => {
    const json = jsonLdScript(articleJsonLd({ ...meta, title: 'A </script><script>alert(1)</script>' }, 'x', image));
    expect(json).not.toContain('<');
    expect(json).toContain('\\u003c/script>');
    expect(JSON.parse(json).headline).toBe('A </script><script>alert(1)</script>');
  });
});
