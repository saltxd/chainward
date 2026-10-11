import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// There is no beta and no paid plan coming after it. Free watching has a real
// limit, and the copy says that instead.

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(tsx?|mdx?)$/.test(name) ? [path] : [];
  });
}

describe('web copy', () => {
  it('never says "during beta"', () => {
    const hits = sourceFiles(SRC).filter((f) => /during beta/i.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(SRC.length))).toEqual([]);
  });

  // The brief is "an investigation" in plain words, and the commissioned tier
  // has no price on the list, so the page must not invent one.
  it('never says "forensic decode" or prices the commissioned investigation', () => {
    const hits = sourceFiles(SRC).filter((f) => /forensic decode|from 250 USDC/i.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(SRC.length))).toEqual([]);
  });
});
