import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface DecodeMeta {
  title: string;
  subtitle: string;
  date: string;
  slug: string;
  draft?: boolean;
  /** Optional search-result title, written for what people actually search; the
   * article headline and social cards keep `title`. */
  seoTitle?: string;
  /** What the finding means for someone about to pay or hire an agent, in plain
   * words; shown in a box above the article. */
  plain?: string;
  /** Where that box sends the reader (a path on this site) and the link text. */
  plainHref?: string;
  plainCta?: string;
}

export interface PlainCallout {
  text: string;
  href: string;
  cta: string;
}

const DEFAULT_PLAIN_CTA = 'Paste an address: should you pay it? →';

/** The plain-English box for a decode, or null when it has no summary. Links stay on this site. */
export function plainCallout(meta: DecodeMeta): PlainCallout | null {
  const text = meta.plain?.trim();
  if (!text) return null;
  const href = meta.plainHref && /^\/(?!\/)/.test(meta.plainHref) ? meta.plainHref : '/';
  return { text, href, cta: meta.plainCta?.trim() || DEFAULT_PLAIN_CTA };
}

export const SITE_URL = 'https://chainward.ai';
export const DECODES_URL = `${SITE_URL}/decodes`;
export const DECODES_FEED_URL = `${DECODES_URL}/feed.xml`;
/** `alternates.types` that advertises the feed in a page's <head>. */
export const DECODES_FEED_TYPES = {
  'application/rss+xml': [{ url: DECODES_FEED_URL, title: 'ChainWard Decodes' }],
};
/** The decodes index's search description; the RSS channel reuses it. */
export const DECODES_DESCRIPTION =
  "Deep dives into AI agent on-chain activity. We check the chain so you don't have to.";

export function decodeUrl(slug: string): string {
  return `${DECODES_URL}/${slug}`;
}

const SNIPPET_MAX = 160;
const SNIPPET_MIN_SENTENCE = 80;
const HEADLINE_MAX = 110;

/** Inline markdown reduced to the words a reader sees, on one line. */
function markdownToText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*?|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(^|\W)(__?)(?=\S)(.+?)(?<=\S)\2(?!\w)/g, '$1$3')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** At most `max` characters, cut after the last whole word and marked with `…`. */
function clipAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  // The `…` takes one character, so the cut has to fall at or before max - 1.
  const space = text.lastIndexOf(' ', max - 1);
  const head = space > 0 ? text.slice(0, space) : text.slice(0, max - 1);
  return `${head.replace(/[\s,;:–—]+$/, '')}…`;
}

/** At most 160 characters: whole sentences when they fill at least half, else whole words. */
function clipSnippet(text: string): string {
  if (text.length <= SNIPPET_MAX) return text;
  // Look one character past the limit so a sentence ending exactly at it still
  // shows the space that follows.
  const sentenceEnds = [...text.slice(0, SNIPPET_MAX + 1).matchAll(/[.!?]['"”’)\]]*(?=\s)/g)]
    .map((m) => m.index + m[0].length)
    .filter((end) => end >= SNIPPET_MIN_SENTENCE);
  const end = sentenceEnds.at(-1);
  return end ? text.slice(0, end) : clipAtWord(text, SNIPPET_MAX);
}

/** The search-result snippet: the plain summary when there is one, else the subtitle. */
export function searchDescription(meta: Pick<DecodeMeta, 'plain' | 'subtitle'>): string {
  return clipSnippet(markdownToText(meta.plain ?? '') || markdownToText(meta.subtitle ?? ''));
}

const CHAINWARD_ORG = { '@type': 'Organization', name: 'ChainWard', url: SITE_URL };

/** schema.org Article for a decode page, so it can show as an article rich result. */
export function articleJsonLd(meta: DecodeMeta, slug: string, imageUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: clipAtWord(meta.title, HEADLINE_MAX),
    description: searchDescription(meta),
    datePublished: new Date(meta.date).toISOString(),
    image: imageUrl,
    mainEntityOfPage: decodeUrl(slug),
    author: CHAINWARD_ORG,
    publisher: CHAINWARD_ORG,
  };
}

/** JSON for an inline <script>: with `<` escaped, no value can close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export interface DecodeContent {
  meta: DecodeMeta;
  content: string;
}

const DELIVERABLES_DIR = path.join(process.cwd(), '../../deliverables');

// gray-matter evaluates `---js` / `---javascript` front matter with eval. Decodes
// only ever use YAML, so refuse the JS engines outright.
function refuseJsFrontMatter(): never {
  throw new Error('JavaScript front matter is not allowed in decodes');
}
const MATTER_OPTIONS = { engines: { js: refuseJsFrontMatter, javascript: refuseJsFrontMatter } };

/** The page renders the frontmatter title as its <h1>; drop a leading markdown
 * `# ` heading so the article doesn't print its title twice. */
export function stripLeadingTitle(content: string): string {
  return content.replace(/^\s*# [^\n]*\n+/, '');
}

/** `decode.md` is the canonical file. Fall back to the first other markdown
 * file only for the older dirs that predate that convention (e.g. ethy-ai).
 * Without the preference, any research note sorting before decode.md
 * (correction-proposal.md, say) wins the glob, parses with no slug, and the
 * decode 404s on a site that still lists it. That happened to
 * axelrod-on-chain. The manifest script carries the same rule; both read
 * these directories and both have to agree. */
function findMarkdownFile(dirPath: string): string | null {
  const SKIP = new Set(['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md']);
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md') && !SKIP.has(f));
  const md = files.includes('decode.md') ? 'decode.md' : files[0];
  return md ? path.join(dirPath, md) : null;
}

export function getAllDecodes(): DecodeMeta[] {
  if (!fs.existsSync(DELIVERABLES_DIR)) return [];

  const dirs = fs.readdirSync(DELIVERABLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const decodes: DecodeMeta[] = [];

  for (const dir of dirs) {
    const mdPath = findMarkdownFile(path.join(DELIVERABLES_DIR, dir.name));
    if (!mdPath) continue;

    const raw = fs.readFileSync(mdPath, 'utf-8');
    const { data } = matter(raw, MATTER_OPTIONS);

    if (data.title && data.slug && data.date && data.draft !== true) {
      decodes.push({
        title: data.title,
        subtitle: data.subtitle ?? '',
        date: data.date,
        slug: data.slug,
        plain: data.plain,
      });
    }
  }

  return decodes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getDecodeBySlug(slug: string): DecodeContent | null {
  if (!fs.existsSync(DELIVERABLES_DIR)) return null;

  const dirs = fs.readdirSync(DELIVERABLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const mdPath = findMarkdownFile(path.join(DELIVERABLES_DIR, dir.name));
    if (!mdPath) continue;

    const raw = fs.readFileSync(mdPath, 'utf-8');
    const { data, content } = matter(raw, MATTER_OPTIONS);

    if (data.slug === slug && data.draft !== true) {
      return {
        meta: {
          title: data.title,
          subtitle: data.subtitle ?? '',
          date: data.date,
          slug: data.slug,
          seoTitle: data.seoTitle,
          plain: data.plain,
          plainHref: data.plainHref,
          plainCta: data.plainCta,
        },
        content: stripLeadingTitle(content),
      };
    }
  }

  return null;
}
