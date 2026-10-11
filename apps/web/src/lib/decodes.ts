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

function findMarkdownFile(dirPath: string): string | null {
  const files = fs.readdirSync(dirPath);
  const SKIP = new Set(['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md']);
  const md = files.find((f) => f.endsWith('.md') && !SKIP.has(f));
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
