# Decodes Pages — Design Spec

Two new route groups for hosting on-chain decode write-ups on chainward.ai.

## Scope

1. `/decodes` listing page + `/decodes/[slug]` individual pages
2. OG image generator at `/api/decodes/[slug]/og`

**Not in scope:** Observatory aGDP changes (aGDP is Virtuals-specific, observatory is cross-ecosystem).

## 1. Decodes Pages

### Routes

- `apps/web/src/app/decodes/page.tsx` — listing page (server component)
- `apps/web/src/app/decodes/[slug]/page.tsx` — individual decode page (server component)

### Content Source

Markdown files in `deliverables/{slug}/`. Each decode directory contains a markdown file with YAML frontmatter:

```yaml
---
title: "Ethy AI On-Chain Decode"
subtitle: "What the #1 Virtuals Agent Looks Like On-Chain"
date: "2026-04-05"
slug: "ethy-ai"
---
```

The build scans `deliverables/*/` directories, finds the `.md` file with frontmatter, and uses it as content. Existing file: `deliverables/ethy-ai-decode/virtuals-acp-deep-dive.md` (needs frontmatter added).

### Listing Page (`/decodes`)

- Reads all decode directories, extracts frontmatter from each
- Renders cards sorted by date descending: title, subtitle, date
- Each card links to `/decodes/[slug]`
- Match observatory page style: dark background, green accents, card borders
- Static generation — no client-side fetching needed

### Individual Page (`/decodes/[slug]`)

- Renders markdown to HTML with proper dark-theme typography
- Elements to style: headings, paragraphs, tables, inline code, blockquotes, horizontal rules, lists, links
- Use a markdown library (remark/rehype or similar — check what's already in the project, otherwise add `next-mdx-remote` or `react-markdown` + `remark-gfm`)
- `generateStaticParams` for static generation
- Match the reading experience of other content pages (Inter font, comfortable line-height, max-width container)

### SEO

Each decode page gets:
- `<title>` from frontmatter title
- `<meta name="description">` from subtitle
- OpenGraph tags pointing to the OG image generator
- Twitter card tags (summary_large_image)
- Canonical URL

Listing page gets generic metadata for the decodes section.

## 2. OG Image Generator

### Route

`apps/web/src/app/api/decodes/[slug]/og/route.tsx`

### Design

Option B from brainstorming — clean editorial style:
- 1200x675 PNG via `@vercel/og` ImageResponse (already a dependency)
- Top bar: "ChainWard" (green, left) + "On-Chain Decode" (gray, right)
- Divider line
- Centered: agent/decode title (large, white, bold)
- Below: subtitle (gray, medium)
- Bottom: `chainward.ai/decodes/{slug}` (dark gray, small)

### Color Constants

Reuse from existing digest image generator:
- `BG: '#0a0a12'`
- `GREEN: '#4ade80'`
- `WHITE: '#ffffff'`
- `GRAY: '#a1a1aa'`
- `DARK_GRAY: '#52525b'`
- `BORDER: '#1e1e2e'`

### Data Source

Reads frontmatter from the markdown file in `deliverables/{slug}/`. No API call needed.

## Style Matching

Must match existing page patterns:
- Dark theme colors and card styling from observatory page
- Layout patterns (max-width containers, padding, typography) from existing pages
- Navigation: include in the same layout flow as other public pages (base, docs, etc.)
- Font: Inter (already loaded globally)

## Deliverable Directory Convention

```
deliverables/
  ethy-ai-decode/
    virtuals-acp-deep-dive.md   ← add frontmatter, slug: "ethy-ai"
    agdp-vs-revenue.png
    wallet-proof.png
  {next-agent}/
    index.md                    ← future decodes
```

Images referenced in markdown: serve via a Next.js API route at `/api/decodes/[slug]/images/[filename]` that reads from `deliverables/{slug}/`. This avoids a build step or duplicating files into `public/`. Markdown image references use this path pattern (rewritten during render).
