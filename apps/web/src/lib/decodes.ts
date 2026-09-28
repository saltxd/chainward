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
}

export interface DecodeContent {
  meta: DecodeMeta;
  content: string;
}

const DELIVERABLES_DIR = path.join(process.cwd(), '../../deliverables');

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
    const { data } = matter(raw);

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
    const { data, content } = matter(raw);

    if (data.slug === slug && data.draft !== true) {
      return {
        meta: {
          title: data.title,
          subtitle: data.subtitle ?? '',
          date: data.date,
          slug: data.slug,
          seoTitle: data.seoTitle,
        },
        content: stripLeadingTitle(content),
      };
    }
  }

  return null;
}
