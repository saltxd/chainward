import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface DecodeMeta {
  title: string;
  subtitle: string;
  date: string;
  slug: string;
}

export interface DecodeContent {
  meta: DecodeMeta;
  content: string;
}

const DELIVERABLES_DIR = path.join(process.cwd(), '../../deliverables');

function findMarkdownFile(dirPath: string): string | null {
  const files = fs.readdirSync(dirPath);
  const md = files.find((f) => f.endsWith('.md') && f !== 'publish-checklist.md' && f !== 'thread.md');
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

    if (data.title && data.slug && data.date) {
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

    if (data.slug === slug) {
      return {
        meta: {
          title: data.title,
          subtitle: data.subtitle ?? '',
          date: data.date,
          slug: data.slug,
        },
        content,
      };
    }
  }

  return null;
}
