import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every page inherits the root layout's metadata. A canonical (or og:url) set
// there told Google that each page without its own, ~450 /base pages, /agent,
// /login and the 404 among them, was the home page (2026-10-11). The home page
// and each public page set their own instead.

const appDir = fileURLToPath(new URL('..', import.meta.url));
const src = (path: string) => readFileSync(join(appDir, path), 'utf8');

const PUBLIC_PAGES = [
  'page.tsx',
  'decodes/page.tsx',
  'decodes/[slug]/page.tsx',
  'report/[address]/page.tsx',
  'reports/page.tsx',
  'set-and-earn/page.tsx',
  'x402/page.tsx',
  'attest/page.tsx',
  'mcp/page.tsx',
  'hyperliquid/page.tsx',
  'base/page.tsx',
  'base/[slug]/page.tsx',
  'docs/page.tsx',
  'rugcheck/page.tsx',
  'paid/[slug]/layout.tsx',
  '(checkout)/request-brief/layout.tsx',
];

describe('canonical URLs', () => {
  it('the root layout sets no canonical and no og:url for pages to inherit', () => {
    const layout = src('layout.tsx');
    expect(layout).not.toMatch(/canonical:/);
    expect(layout).not.toMatch(/openGraph:\s*\{[^}]*\burl:/);
  });

  it('the home page owns https://chainward.ai/', () => {
    expect(src('page.tsx')).toMatch(/alternates:\s*\{\s*canonical:\s*`\$\{SITE_URL\}\/`\s*\}/);
  });

  it('each public page sets its own', () => {
    const missing = PUBLIC_PAGES.filter((p) => !/alternates:\s*\{\s*canonical/.test(src(p)));
    expect(missing).toEqual([]);
  });
});

describe('site description', () => {
  it('says what you get, in plain words', async () => {
    const { SITE_DESCRIPTION, SITE_TITLE } = await import('@/lib/siteCopy');
    expect(SITE_DESCRIPTION).toMatch(/Pay or Hold, and why/);
    for (const text of [SITE_TITLE, SITE_DESCRIPTION]) {
      expect(text).not.toMatch(/safety verdict|forensic|—/i);
    }
  });
});
