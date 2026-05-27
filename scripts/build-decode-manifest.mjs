#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DELIVERABLES = join(REPO_ROOT, 'deliverables');
const OUT_PATH = join(REPO_ROOT, 'apps/api/src/data/decode-manifest.json');

const SKIP_FILES = new Set(['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md', 'README.md']);
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw };
  const yaml = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const data = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    data[m[1]] = v;
  }
  return { data, body };
}

function buildManifest() {
  if (!existsSync(DELIVERABLES)) {
    console.error(`deliverables dir not found at ${DELIVERABLES}`);
    process.exit(1);
  }

  const entries = [];

  for (const dir of readdirSync(DELIVERABLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(DELIVERABLES, dir.name);
    const mdFile = readdirSync(dirPath).find(
      (f) => f.endsWith('.md') && !SKIP_FILES.has(f),
    );
    if (!mdFile) continue;

    const raw = readFileSync(join(dirPath, mdFile), 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.slug || !data.title || !data.date) continue;
    if (data.draft === true || data.draft === 'true') continue;

    const explicitAddrs = Array.isArray(data.addresses) ? data.addresses : [];
    const bodyAddrs = (body.match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase());
    const addresses = Array.from(new Set([...explicitAddrs.map((a) => a.toLowerCase()), ...bodyAddrs]));

    entries.push({
      slug: data.slug,
      title: data.title,
      subtitle: data.subtitle ?? '',
      date: data.date,
      url: `https://chainward.ai/decodes/${data.slug}`,
      addresses,
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const byAddress = {};
  for (const e of entries) {
    for (const a of e.addresses) {
      (byAddress[a] ??= []).push(e.slug);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    decodes: entries,
    byAddress,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${entries.length} decodes (${Object.keys(byAddress).length} indexed addresses) to ${OUT_PATH}`);
}

buildManifest();
