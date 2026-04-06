# Decodes Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/decodes` listing page and `/decodes/[slug]` individual decode pages, plus an OG image generator for Twitter cards.

**Architecture:** Static Next.js pages that read markdown files from `deliverables/*/` at build time. Frontmatter provides metadata. OG images generated via `@vercel/og` (already a dependency). No database, no API calls — purely filesystem-based content.

**Tech Stack:** Next.js 15 (existing), react-markdown + remark-gfm (new deps), gray-matter (new dep), @vercel/og (existing), Tailwind CSS v4 (existing)

---

### Task 1: Add markdown dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/web && pnpm add react-markdown remark-gfm gray-matter
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm install && pnpm typecheck
```

Expected: clean typecheck, no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "deps: add react-markdown, remark-gfm, gray-matter to web app"
```

---

### Task 2: Add frontmatter to the Ethy AI decode

**Files:**
- Modify: `deliverables/ethy-ai-decode/virtuals-acp-deep-dive.md`

- [ ] **Step 1: Add YAML frontmatter to the top of the file**

Prepend this block to the very top of `deliverables/ethy-ai-decode/virtuals-acp-deep-dive.md`, before the existing `# Ethy AI On-Chain Decode` heading:

```yaml
---
title: "Ethy AI On-Chain Decode"
subtitle: "What the #1 Virtuals Agent Looks Like On-Chain"
date: "2026-04-05"
slug: "ethy-ai"
---
```

The existing content stays unchanged below the frontmatter block.

- [ ] **Step 2: Commit**

```bash
git add deliverables/ethy-ai-decode/virtuals-acp-deep-dive.md
git commit -m "content: add frontmatter to Ethy AI decode for /decodes page"
```

---

### Task 3: Create decode content loader utility

**Files:**
- Create: `apps/web/src/lib/decodes.ts`

This utility reads decode markdown files from `deliverables/*/`, parses frontmatter, and returns structured data. Used by both the listing page and individual pages.

- [ ] **Step 1: Create the loader**

Create `apps/web/src/lib/decodes.ts`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/decodes.ts
git commit -m "feat: add decode content loader for deliverables markdown"
```

---

### Task 4: Create the `/decodes` listing page

**Files:**
- Create: `apps/web/src/app/decodes/page.tsx`

Style reference: Match the docs layout pattern (`apps/web/src/app/docs/layout.tsx`) for the top bar — ChainWard logo left, breadcrumb-style "/ Decodes" right. Card style: use `border border-border bg-card` pattern from the observatory leaderboard. Sharp corners (global `border-radius: 0` is already set in globals.css). Green accent for hover/active states.

- [ ] **Step 1: Create the listing page**

Create `apps/web/src/app/decodes/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllDecodes } from '@/lib/decodes';

export const metadata: Metadata = {
  title: 'On-Chain Decodes — AI Agent Investigations',
  description:
    'Deep dives into AI agent on-chain activity. We check the chain so you don\'t have to.',
  alternates: { canonical: 'https://chainward.ai/decodes' },
  openGraph: {
    title: 'On-Chain Decodes | ChainWard',
    description:
      'Deep dives into AI agent on-chain activity on Base.',
    url: 'https://chainward.ai/decodes',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'On-Chain Decodes | ChainWard',
    description: 'Deep dives into AI agent on-chain activity on Base.',
    images: ['/chainward-og.png'],
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function DecodesPage() {
  const decodes = getAllDecodes();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar — matches docs layout */}
      <nav className="border-b border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-6 w-6" />
            ChainWard
          </Link>
          <span className="text-text-muted">/</span>
          <span className="text-sm text-muted-foreground">Decodes</span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h1 className="text-2xl font-bold text-white">On-Chain Decodes</h1>
        <p className="mt-2 text-muted-foreground">
          We trace wallets, verify claims, and document what the on-chain data actually shows.
        </p>

        <div className="mt-10 space-y-4">
          {decodes.map((decode) => (
            <Link
              key={decode.slug}
              href={`/decodes/${decode.slug}`}
              className="group block border border-border bg-card p-6 transition-colors hover:border-border-hover"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-white group-hover:text-accent-foreground transition-colors">
                    {decode.title}
                  </h2>
                  {decode.subtitle && (
                    <p className="mt-1 text-sm text-muted-foreground">{decode.subtitle}</p>
                  )}
                </div>
                <time className="shrink-0 text-xs text-text-muted" dateTime={decode.date}>
                  {formatDate(decode.date)}
                </time>
              </div>
            </Link>
          ))}

          {decodes.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">No decodes published yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/decodes/page.tsx
git commit -m "feat: add /decodes listing page"
```

---

### Task 5: Create the `/decodes/[slug]` individual page

**Files:**
- Create: `apps/web/src/app/decodes/[slug]/page.tsx`

This renders a full decode article from markdown. Style the markdown prose for the dark theme — headings, paragraphs, tables, blockquotes, horizontal rules, lists, links, inline code. Match the typography of the docs pages (Inter font, comfortable line height, max-width container). Use the same top bar as the listing page but with a back-link.

- [ ] **Step 1: Create the individual decode page**

Create `apps/web/src/app/decodes/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAllDecodes, getDecodeBySlug } from '@/lib/decodes';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllDecodes().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) return {};

  const { meta } = decode;
  const ogImageUrl = `https://chainward.ai/api/decodes/${slug}/og`;

  return {
    title: meta.title,
    description: meta.subtitle,
    alternates: { canonical: `https://chainward.ai/decodes/${slug}` },
    openGraph: {
      title: meta.title,
      description: meta.subtitle,
      url: `https://chainward.ai/decodes/${slug}`,
      type: 'article',
      publishedTime: meta.date,
      images: [{ url: ogImageUrl, width: 1200, height: 675 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.subtitle,
      images: [ogImageUrl],
    },
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function DecodePage({ params }: PageProps) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) notFound();

  const { meta, content } = decode;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <nav className="border-b border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-6 w-6" />
            ChainWard
          </Link>
          <span className="text-text-muted">/</span>
          <Link href="/decodes" className="text-sm text-muted-foreground hover:text-white transition-colors">
            Decodes
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* Article header */}
        <header className="mb-10 border-b border-border pb-8">
          <time className="text-xs text-text-muted" dateTime={meta.date}>
            {formatDate(meta.date)}
          </time>
          <h1 className="mt-2 text-3xl font-bold text-white">{meta.title}</h1>
          {meta.subtitle && (
            <p className="mt-2 text-lg text-muted-foreground">{meta.subtitle}</p>
          )}
        </header>

        {/* Markdown content */}
        <article className="decode-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>

        {/* Back link */}
        <div className="mt-16 border-t border-border pt-8">
          <Link
            href="/decodes"
            className="text-sm text-muted-foreground hover:text-accent-foreground transition-colors"
          >
            &larr; All Decodes
          </Link>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add dark-theme prose styles to globals.css**

Append the following to `apps/web/src/app/globals.css` at the end of the file:

```css
/* ── Decode article prose ─────────────────────────────────────────────── */
.decode-prose h1,
.decode-prose h2,
.decode-prose h3,
.decode-prose h4 {
  color: var(--color-foreground);
  font-weight: 700;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
}

.decode-prose h1 { font-size: 1.75rem; }
.decode-prose h2 { font-size: 1.375rem; }
.decode-prose h3 { font-size: 1.125rem; }
.decode-prose h4 { font-size: 1rem; }

.decode-prose p {
  color: var(--color-muted-foreground);
  line-height: 1.75;
  margin-bottom: 1.25rem;
}

.decode-prose a {
  color: var(--color-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.decode-prose a:hover {
  color: var(--color-foreground);
}

.decode-prose strong {
  color: var(--color-foreground);
  font-weight: 600;
}

.decode-prose ul,
.decode-prose ol {
  color: var(--color-muted-foreground);
  padding-left: 1.5rem;
  margin-bottom: 1.25rem;
}

.decode-prose ul { list-style-type: disc; }
.decode-prose ol { list-style-type: decimal; }

.decode-prose li {
  margin-bottom: 0.375rem;
  line-height: 1.75;
}

.decode-prose blockquote {
  border-left: 3px solid var(--color-accent-foreground);
  padding: 0.75rem 1rem;
  margin: 1.5rem 0;
  background: rgba(255,255,255,0.02);
}

.decode-prose blockquote p {
  color: var(--color-foreground);
  margin-bottom: 0;
}

.decode-prose code {
  color: var(--color-accent-foreground);
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: rgba(255,255,255,0.06);
  padding: 0.125rem 0.375rem;
}

.decode-prose pre {
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1.25rem;
}

.decode-prose pre code {
  background: none;
  padding: 0;
  font-size: 0.8125rem;
  line-height: 1.7;
}

.decode-prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 2rem 0;
}

.decode-prose table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.decode-prose th {
  text-align: left;
  font-weight: 600;
  color: var(--color-foreground);
  border-bottom: 1px solid var(--color-border);
  padding: 0.625rem 0.75rem;
}

.decode-prose td {
  color: var(--color-muted-foreground);
  border-bottom: 1px solid var(--color-border);
  padding: 0.625rem 0.75rem;
}

.decode-prose tr:hover td {
  background: rgba(255,255,255,0.02);
}

.decode-prose img {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  margin: 1.5rem 0;
}
```

- [ ] **Step 3: Verify typecheck and dev build**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/decodes/\[slug\]/page.tsx apps/web/src/app/globals.css
git commit -m "feat: add /decodes/[slug] page with dark-theme markdown rendering"
```

---

### Task 6: Create the OG image generator for decode cards

**Files:**
- Create: `apps/web/src/app/api/decodes/[slug]/og/route.tsx`

Style reference: Use the exact same design constants from `apps/web/src/app/api/digest/latest/image/[section]/route.tsx`. The layout is option B from brainstorming — centered title + subtitle, editorial and clean.

- [ ] **Step 1: Create the OG image route**

Create `apps/web/src/app/api/decodes/[slug]/og/route.tsx`:

```tsx
import { ImageResponse } from '@vercel/og';
import { getDecodeBySlug } from '@/lib/decodes';

const BG = '#0a0a12';
const GREEN = '#4ade80';
const WHITE = '#ffffff';
const GRAY = '#a1a1aa';
const DARK_GRAY = '#52525b';
const BORDER = '#1e1e2e';

const WIDTH = 1200;
const HEIGHT = 675;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);

  if (!decode) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: BG,
            color: GRAY,
            fontSize: 32,
          }}
        >
          <span style={{ color: GREEN, fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
            ChainWard
          </span>
          <span>Decode not found</span>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  }

  const { meta } = decode;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: BG,
          padding: 60,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 28, color: GREEN, fontWeight: 700 }}>
            ChainWard
          </span>
          <span style={{ fontSize: 22, color: GRAY, fontWeight: 400 }}>
            On-Chain Decode
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: BORDER,
            marginTop: 8,
            marginBottom: 24,
          }}
        />

        {/* Centered content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: WHITE,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            {meta.title}
          </span>
          {meta.subtitle && (
            <span
              style={{
                fontSize: 24,
                fontWeight: 400,
                color: GRAY,
                marginTop: 20,
                maxWidth: 700,
                lineHeight: 1.4,
              }}
            >
              {meta.subtitle}
            </span>
          )}
        </div>

        {/* Footer URL */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'flex-end',
            marginTop: 'auto',
            paddingTop: 16,
          }}
        >
          <span style={{ color: DARK_GRAY, fontSize: 18, fontWeight: 400 }}>
            chainward.ai/decodes/{slug}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    },
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/decodes/\[slug\]/og/route.tsx
git commit -m "feat: add OG image generator for decode cards"
```

---

### Task 7: Add Decodes link to site navigation

**Files:**
- Modify: `apps/web/src/app/page.tsx` (landing nav)
- Modify: `apps/web/src/app/base/observatory-page.tsx` (observatory nav)

Add a "Decodes" link alongside the existing Observatory link in both navigation bars.

- [ ] **Step 1: Add Decodes link to the landing page nav**

In `apps/web/src/app/page.tsx`, find this block (around line 70-75):

```tsx
          <Link
            href="/base"
            className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Observatory
          </Link>
```

Add a Decodes link immediately after it (before the `{isAuthenticated ? (` block):

```tsx
          <Link
            href="/base"
            className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Observatory
          </Link>
          <Link
            href="/decodes"
            className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Decodes
          </Link>
```

- [ ] **Step 2: Add Decodes link to the observatory nav**

In `apps/web/src/app/base/observatory-page.tsx`, find this block (around line 365-368):

```tsx
          <nav className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Link href="/base" className="text-foreground">Observatory</Link>
            <Link href="/base/digest" className="hover:text-foreground transition-colors">Digest</Link>
            <Link href="/wallet" className="hover:text-foreground transition-colors">Wallet Lookup</Link>
          </nav>
```

Add a Decodes link:

```tsx
          <nav className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Link href="/base" className="text-foreground">Observatory</Link>
            <Link href="/base/digest" className="hover:text-foreground transition-colors">Digest</Link>
            <Link href="/decodes" className="hover:text-foreground transition-colors">Decodes</Link>
            <Link href="/wallet" className="hover:text-foreground transition-colors">Wallet Lookup</Link>
          </nav>
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/base/observatory-page.tsx
git commit -m "feat: add Decodes link to landing and observatory navigation"
```

---

### Task 8: Smoke test the full flow

- [ ] **Step 1: Start dev server**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm dev
```

- [ ] **Step 2: Verify the listing page**

Open `http://localhost:3000/decodes` in a browser. Confirm:
- Top bar shows ChainWard logo + "/ Decodes" breadcrumb
- Ethy AI decode card appears with title, subtitle, and date
- Card links to `/decodes/ethy-ai`

- [ ] **Step 3: Verify the individual page**

Open `http://localhost:3000/decodes/ethy-ai`. Confirm:
- Top bar shows ChainWard logo + "/ Decodes" breadcrumb (Decodes links back to listing)
- Article header: date, title, subtitle
- Markdown renders with dark theme: tables have borders, headings are white, text is gray, blockquotes have green left border, code has mono font with subtle background
- "All Decodes" back link at bottom
- No broken layout or unstyled elements

- [ ] **Step 4: Verify the OG image**

Open `http://localhost:3000/api/decodes/ethy-ai/og` in a browser. Confirm:
- 1200x675 image renders
- ChainWard branding top-left, "On-Chain Decode" top-right
- Centered title and subtitle
- `chainward.ai/decodes/ethy-ai` at bottom-right
- Dark background, green accent, matches the digest image style

- [ ] **Step 5: Verify navigation links**

Open `http://localhost:3000` and `http://localhost:3000/base`. Confirm "Decodes" link appears in both navbars and navigates to `/decodes`.

- [ ] **Step 6: Run full typecheck**

```bash
cd /Users/mburkholz/Forge/agentguard && pnpm typecheck
```

Expected: passes cleanly
