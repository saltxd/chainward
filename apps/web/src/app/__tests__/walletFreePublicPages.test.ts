import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The public pages (home, decodes, the observatory, the free tools, docs) are
// where search traffic lands. None of them use a wallet, so none of them may
// pull the wallet or sign-in libraries into their bundle through a static
// import. Pay buttons load the wallet half with next/dynamic on first click,
// which this walk does not follow (only `import ... from` / `export ... from`).

const SRC = fileURLToPath(new URL('../..', import.meta.url));

const WALLET_PACKAGES = ['siwe', 'ethers', 'wagmi', '@rainbow-me/rainbowkit', '@wagmi/', '@walletconnect/', '@metamask/'];
const WALLET_FILES = ['providers/web3-provider', 'lib/wagmi', 'lib/walletConnectors', 'lib/siwe-sign-in'];

const PUBLIC_ENTRIES = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/not-found.tsx',
  'app/error.tsx',
  'app/decodes/page.tsx',
  'app/decodes/[slug]/page.tsx',
  'app/base/page.tsx',
  'app/base/[slug]/page.tsx',
  'app/rugcheck/page.tsx',
  'app/docs/layout.tsx',
  'app/docs/page.tsx',
  'app/report/[address]/page.tsx',
  'app/x402/page.tsx',
  'app/set-and-earn/page.tsx',
  'components/press/index.ts',
];

// Value imports only: `import type` and `export type` vanish at build time.
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every static import chain from `entry` that ends in a wallet package or file. */
function walletChains(entry: string): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    const rel = file.slice(SRC.length);
    if (WALLET_FILES.some((w) => rel.replace(/\.tsx?$/, '') === w)) {
      hits.push([...chain, rel].join(' -> '));
      return;
    }
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = match[1]!;
      if (WALLET_PACKAGES.some((p) => spec === p || spec.startsWith(p.endsWith('/') ? p : `${p}/`))) {
        hits.push([...chain, rel, spec].join(' -> '));
        continue;
      }
      const next = resolveLocal(spec, file);
      if (next) walk(next, [...chain, rel]);
    }
  };
  walk(join(SRC, entry), []);
  return hits;
}

describe('public pages stay wallet-free', () => {
  it.each(PUBLIC_ENTRIES)('%s has no static import path to siwe, ethers, wagmi or RainbowKit', (entry) => {
    expect(walletChains(entry)).toEqual([]);
  });

  it('the walk does find the wallet code where it belongs (/login)', () => {
    // Guards the guard: a walk that found nothing anywhere would pass the list above.
    expect(walletChains('app/(auth)/login/page.tsx').length).toBeGreaterThan(0);
  });
});
