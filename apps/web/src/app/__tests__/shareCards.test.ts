import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// X builds link cards from twitter:* tags. A page that sets openGraph but no
// twitter block inherits the root layout's card, so a shared /set-and-earn link
// rendered as the generic "risk checks for any address" card (2026-10-09).
const appDir = fileURLToPath(new URL('..', import.meta.url));

function metadataFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : metadataFiles(path);
    return /^(page|layout)\.tsx$/.test(name) ? [path] : [];
  });
}

describe('share cards', () => {
  it('every page that sets openGraph also sets its own twitter card', () => {
    const missing = metadataFiles(appDir)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return /openGraph:\s*\{/.test(src) && !/twitter:\s*\{[^}]*card:\s*'summary_large_image'/.test(src);
      })
      .map((f) => relative(appDir, f));
    expect(missing).toEqual([]);
  });
});
