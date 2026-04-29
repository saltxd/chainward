// scripts/auto-decode/og-render.ts
import { renderOg, productionDeps } from "./lib/og-render.js";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: tsx scripts/auto-decode/og-render.ts <slug>");
  process.exit(2);
}

const port = Number(process.env.OG_RENDER_PORT ?? 3001);
const repoRoot = process.cwd();

await renderOg({ slug, repoRoot, port, deps: productionDeps });
console.log(`[og-render] wrote apps/web/public/decodes/${slug}/og.png`);
