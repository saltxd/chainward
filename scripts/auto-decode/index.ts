// scripts/auto-decode/index.ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseTarget, slugify } from "./lib/validators.js";
import { resolveTarget } from "./lib/resolver.js";
import {
  checkSlugCollision,
  productionDeps as collisionDeps,
} from "./lib/slug-collision.js";

interface Config {
  repoRoot: string;
  oauthToken: string;
  webhookUrl: string;
  ghToken: string;
  dryRun: boolean;
}

function loadConfig(): Config {
  // pnpm scripts run from package.json dir = repo root, so cwd is reliable
  const repoRoot = process.cwd();
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`missing env var: ${name}`);
    return v;
  };
  return {
    repoRoot,
    oauthToken: required("CLAUDE_CODE_OAUTH_TOKEN"),
    webhookUrl: required("DISCORD_WEBHOOK_URL"),
    ghToken: required("GH_TOKEN"),
    dryRun: process.env.DRY_RUN !== "false",
  };
}

async function main() {
  const rawTarget = process.argv[2];
  if (!rawTarget) {
    console.error("usage: pnpm decode:auto <0xADDRESS|@HANDLE>");
    process.exit(2);
  }

  const config = loadConfig();
  const target = parseTarget(rawTarget);
  const resolved = await resolveTarget(target, { fetch });
  const name = resolved.name ?? target.value;
  const slug = slugify(name);

  console.log(`[auto-decode] target=${rawTarget} → name=${name} address=${resolved.address}`);
  console.log(`[auto-decode] slug=${slug}`);

  const collision = await checkSlugCollision(slug, config.repoRoot, collisionDeps);
  if (!collision.ok) {
    console.error(`[auto-decode] slug collision: ${collision.reason}`);
    process.exit(3);
  }

  const deliverables = join(config.repoRoot, "deliverables", slug);
  await mkdir(deliverables, { recursive: true });
  console.log(`[auto-decode] created ${deliverables}`);

  console.log(
    `[auto-decode] dryRun=${config.dryRun} — would now invoke claude --print with auto-decode-prompts/orchestrator.md`,
  );
}

main().catch((err) => {
  console.error(`[auto-decode] error: ${err.message}`);
  process.exit(1);
});
