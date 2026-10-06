import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listDecodes } from '../lib/decodeManifest.js';

// The API serves /api/public/decodes (and the MCP decode tools) from a manifest
// generated off deliverables/. It went stale once (16 decodes against the site's
// 19). This reads the published decodes straight from disk and compares.
const DELIVERABLES = fileURLToPath(new URL('../../../../deliverables', import.meta.url));

function frontmatterField(raw: string, field: string): string | undefined {
  if (!raw.startsWith('---')) return undefined;
  const end = raw.indexOf('\n---', 3);
  const m = raw.slice(3, end).match(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm'));
  const value = m?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2');
  return value || undefined;
}

/** slug of every non-draft deliverables/<dir>/<file>.md that has a slug, title and date. */
function publishedSlugs(only?: (file: string) => boolean): Set<string> {
  const slugs = new Set<string>();
  for (const dir of readdirSync(DELIVERABLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(DELIVERABLES, dir.name))) {
      if (!file.endsWith('.md') || (only && !only(file))) continue;
      const raw = readFileSync(join(DELIVERABLES, dir.name, file), 'utf-8');
      const slug = frontmatterField(raw, 'slug');
      if (!slug || !frontmatterField(raw, 'title') || !frontmatterField(raw, 'date')) continue;
      if (frontmatterField(raw, 'draft') === 'true') continue;
      slugs.add(slug);
    }
  }
  return slugs;
}

describe('decode manifest', () => {
  it.skipIf(!existsSync(DELIVERABLES))('lists every published deliverables/*/decode.md', () => {
    const manifest = new Set(listDecodes().map((d) => d.slug));
    const missing = [...publishedSlugs((f) => f === 'decode.md')].filter((s) => !manifest.has(s));
    expect(missing, 'run: node scripts/build-decode-manifest.mjs').toEqual([]);
  });

  it.skipIf(!existsSync(DELIVERABLES))('lists nothing that is not a published decode', () => {
    const onDisk = publishedSlugs();
    const extra = listDecodes()
      .map((d) => d.slug)
      .filter((s) => !onDisk.has(s));
    expect(extra, 'run: node scripts/build-decode-manifest.mjs').toEqual([]);
  });

  it('lists decodes newest first', () => {
    const dates = listDecodes().map((d) => new Date(d.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});
