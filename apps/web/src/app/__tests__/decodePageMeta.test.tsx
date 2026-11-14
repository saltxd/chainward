import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/press', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/press')>();
  return {
    ...actual,
    PressShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Masthead: () => null,
    PressDateline: () => null,
    Colophon: () => null,
    BriefOffer: () => null,
    FreeTools: () => null,
  };
});

import DecodePage, { generateMetadata } from '../decodes/[slug]/page';
import { metadata as indexMetadata } from '../decodes/page';
import { getAllDecodes, getDecodeBySlug, searchDescription } from '@/lib/decodes';

const feed = { 'application/rss+xml': [{ url: 'https://chainward.ai/decodes/feed.xml', title: 'ChainWard Decodes' }] };

// A decode with a plain summary, so the snippet and the social cards differ.
const slug = getAllDecodes().find((d) => d.plain?.trim())!.slug;
const params = Promise.resolve({ slug });

describe('decode page metadata', () => {
  it('uses the plain summary for search and leaves the social cards on the subtitle', async () => {
    const { meta } = getDecodeBySlug(slug)!;
    const md = await generateMetadata({ params });
    expect(md.description).toBe(searchDescription(meta));
    expect(md.description).not.toBe(meta.subtitle);
    expect(md.openGraph?.description).toBe(meta.subtitle);
    expect(md.twitter?.description).toBe(meta.subtitle);
    expect(md.openGraph?.title).toBe(meta.title);
  });

  it('keeps the canonical and advertises the feed', async () => {
    const md = await generateMetadata({ params });
    expect(md.alternates).toEqual({ canonical: `https://chainward.ai/decodes/${slug}`, types: feed });
    expect(indexMetadata.alternates).toEqual({ canonical: 'https://chainward.ai/decodes', types: feed });
  });

  it('renders Article structured data', async () => {
    const html = renderToStaticMarkup(await DecodePage({ params }));
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy();
    const ld = JSON.parse(json!);
    expect(ld['@type']).toBe('Article');
    expect(ld.mainEntityOfPage).toBe(`https://chainward.ai/decodes/${slug}`);
    expect(ld.image).toMatch(new RegExp(`^https://chainward\\.ai/(api/)?decodes/${slug}/og(\\.png)?$`));
  });
});
