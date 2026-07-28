import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-config-next is still eslintrc-shaped, so it comes in through FlatCompat.
const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * One flat config for the whole monorepo.
 *
 * Deliberately type-UNAWARE (`tseslint.configs.recommended`, not
 * `recommendedTypeChecked`): `pnpm typecheck` already runs tsc over all 16
 * packages, so type-aware lint rules would re-do that work for ~10x the
 * runtime and mostly restate errors tsc already catches. Lint's job here is
 * the class of defect the compiler *doesn't* see — dead code, unused symbols,
 * fallthrough, shadowed globals, accidental `any` boundaries.
 */
export default tseslint.config(
  {
    // Build artifacts, vendored code, and generated output. Kept in one place
    // so `eslint .` from the root is the only invocation anyone needs.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'test-results/**',
      'patches/**',
      'deliverables/**',
      'docs/**',
      'codex/**',
      'Logos/**',
      'deploy/**',
      'packages/intelligence/**',
      '**/*.d.ts',
      // agents/test-agent carries an untracked Python virtualenv that vendors
      // browser JS (werkzeug's debugger, urllib3's emscripten worker).
      '**/venv/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      // ── Dead code, the thing this gate exists to catch ──────────────────
      // Unused args are allowed when prefixed `_` (common in handler
      // signatures we can't shorten), and caught errors are exempt because
      // `catch { }` narrowing is used deliberately in a few workers.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      // `try { await logout() } catch {}` is a deliberate best-effort pattern on
      // teardown paths (sign-out, wallet disconnect) where failing is fine.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // ── Real-bug rules that tsc does not cover ──────────────────────────
      'no-self-compare': 'error',
      'no-unused-private-class-members': 'error',
      // Off: the graceful-shutdown idiom here is `let stop = false` flipped
      // inside a SIGTERM/SIGINT handler and read by `while (!stop)`. The rule
      // only looks at the loop body, so every correct shutdown flag in the
      // agents and workers reads as an infinite loop.
      'no-unmodified-loop-condition': 'off',
      'require-atomic-updates': 'off', // too many false positives on await-in-branch
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],

      // ── Deliberately off ────────────────────────────────────────────────
      // The DB layer returns `unknown[]` from raw `sql` templates and every
      // observatory/indexer query casts through `as unknown as Array<...>`.
      // Banning `any` outright would mean ~200 mechanical suppressions with no
      // defect caught, so it stays a warning we can burn down separately.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // console IS the logging transport for CLI + scripts.
      'no-console': 'off',
    },
  },

  // ── Next.js app ───────────────────────────────────────────────────────
  ...compat.extends('next/core-web-vitals').map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
  })),
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      // App Router only — there is no pages/ dir for this rule to scan, and
      // leaving it on makes every run print a spurious "Pages directory cannot
      // be found" banner.
      '@next/next/no-html-link-for-pages': 'off',
      // `// no balance data yet` inside JSX is the site's terminal-comment
      // idiom for empty states and datelines (8 uses, each with its own CSS
      // class). It renders on purpose; the rule reads it as a stray comment.
      'react/jsx-no-comment-textnodes': 'off',
    },
  },

  // ── Tests ─────────────────────────────────────────────────────────────
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      // Fixtures and mock factories legitimately hold unused shapes.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ── Plain JS tooling ──────────────────────────────────────────────────
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
