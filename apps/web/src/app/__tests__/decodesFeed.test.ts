import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDecodesFeed } from '@/lib/decodesFeed';

// The feed is built from the deliverables on disk at build time. These tests point
// the loader at a throwaway deliverables directory so drafts and ordering are pinned.

const root = mkdtempSync(join(tmpdir(), 'decodes-feed-'));

function writeDecode(dir: string, frontmatter: string): void {
  mkdirSync(join(root, 'deliverables', dir), { recursive: true });
  writeFileSync(join(root, 'deliverables', dir, 'decode.md'), `---\n${frontmatter}\n---\n\nBody.\n`);
}

/** Tags open and close in order, and every `&` starts an entity. */
function isWellFormed(xml: string): boolean {
  if (/&(?!(amp|lt|gt|quot|apos);)/.test(xml)) return false;
  const stack: string[] = [];
  for (const [, close, name = '', selfClose] of xml.matchAll(/<(\/?)([a-zA-Z][\w:]*)[^>]*?(\/?)>/g)) {
    if (selfClose) continue;
    if (!close) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

const items = (xml: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1] ?? '');
const field = (item = '', tag: string) => item.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1];

let GET: () => Promise<Response> | Response;
let dynamic: string;

beforeAll(async () => {
  writeDecode('older', 'title: Older one\nsubtitle: The older deck.\ndate: 2026-09-01\nslug: older-one');
  writeDecode(
    'newer',
    [
      `title: "Fees & \\"loops\\" <in> 'agents'"`,
      'subtitle: Deck.',
      'date: 2026-10-29',
      'slug: newer-one',
      `plain: "Most of it loops & returns <home>."`,
    ].join('\n'),
  );
  writeDecode('middle', 'title: Middle\nsubtitle: Middle deck.\ndate: 2026-10-01\nslug: middle-one');
  writeDecode('unfinished', 'title: Draft\nsubtitle: Not yet.\ndate: 2026-11-01\nslug: draft-one\ndraft: true');

  const cwd = join(root, 'apps', 'web');
  mkdirSync(cwd, { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.resetModules();
  ({ GET, dynamic } = await import('../decodes/feed.xml/route'));
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('/decodes/feed.xml', () => {
  it('is generated at build time, when the deliverables are present', () => {
    expect(dynamic).toBe('force-static');
  });

  it('serves RSS 2.0 with a self link', async () => {
    const res = await GET();
    expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    const xml = await res.text();
    expect(isWellFormed(xml)).toBe(true);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<title>ChainWard Decodes</title>');
    expect(xml).toContain('<link>https://chainward.ai/decodes</link>');
    expect(xml).toContain(
      '<atom:link href="https://chainward.ai/decodes/feed.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain(
      '<description>Deep dives into AI agent on-chain activity. We check the chain so you don&apos;t have to.</description>',
    );
  });

  it('lists each published decode once, newest first, and no drafts', async () => {
    const xml = await (await GET()).text();
    const links = items(xml).map((i) => field(i, 'link'));
    expect(links).toEqual([
      'https://chainward.ai/decodes/newer-one',
      'https://chainward.ai/decodes/middle-one',
      'https://chainward.ai/decodes/older-one',
    ]);
    expect(xml).not.toContain('draft-one');
  });

  it('gives each item a permalink guid, an RFC 822 date and the search snippet', async () => {
    const [newer, , older] = items(await (await GET()).text());
    expect(newer).toContain('<guid isPermaLink="true">https://chainward.ai/decodes/newer-one</guid>');
    expect(field(newer, 'pubDate')).toBe('Thu, 29 Oct 2026 00:00:00 GMT');
    expect(field(older, 'pubDate')).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
    expect(field(older, 'description')).toBe('The older deck.');
  });

  it('escapes &, <, > and quotes in every text value', async () => {
    const [newer] = items(await (await GET()).text());
    expect(field(newer, 'title')).toBe('Fees &amp; &quot;loops&quot; &lt;in&gt; &apos;agents&apos;');
    expect(field(newer, 'description')).toBe('Most of it loops &amp; returns &lt;home&gt;.');
  });
});

describe('buildDecodesFeed', () => {
  it('is a valid empty channel when there are no decodes', () => {
    const xml = buildDecodesFeed([]);
    expect(isWellFormed(xml)).toBe(true);
    expect(items(xml)).toEqual([]);
  });
});
