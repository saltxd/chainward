// scripts/auto-decode/index.ts
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTarget, slugify, displayName } from "./lib/validators.js";
import { resolveTarget } from "@chainward/decode";
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
  const name = displayName(resolved.name, resolved.address);
  const slug = slugify(name);

  console.log(`[auto-decode] target=${rawTarget} → name=${name} address=${resolved.address}`);
  console.log(`[auto-decode] slug=${slug}`);

  const collision = await checkSlugCollision(slug, config.repoRoot, collisionDeps);
  if (!collision.ok) {
    console.error(`[auto-decode] slug collision: ${collision.reason}`);
    process.exit(3);
  }

  // Fail fast on a missing claude binary BEFORE creating the deliverables dir —
  // an ENOENT after mkdir strands an empty dir that reads as a slug collision.
  try {
    await new Promise<void>((resolve, reject) => {
      const probe = spawn("claude", ["--version"], { stdio: "ignore" });
      probe.on("error", reject);
      probe.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`claude --version exited ${code}`)),
      );
    });
  } catch (err: any) {
    console.error(
      `[auto-decode] claude CLI not runnable (${err?.message ?? err}) — is it on PATH?`,
    );
    process.exit(4);
  }

  const deliverables = join(config.repoRoot, "deliverables", slug);
  await mkdir(deliverables, { recursive: true });
  console.log(`[auto-decode] created ${deliverables}`);

  const orchestratorPromptPath = join(
    config.repoRoot,
    "scripts/auto-decode-prompts/orchestrator.md",
  );
  const promptTemplate = await readFile(orchestratorPromptPath, "utf-8");
  const prompt = promptTemplate
    .replace(/<TARGET_ADDRESS>/g, resolved.address)
    .replace(/<TARGET_NAME>/g, name)
    .replace(/<SLUG>/g, slug)
    .replace(/<DELIVERABLES_DIR>/g, deliverables)
    .replace(/<REPO_ROOT>/g, config.repoRoot)
    .replace(/<DRY_RUN>/g, String(config.dryRun));

  const mcpConfigPath = join(config.repoRoot, "scripts/auto-decode.mcp.json");

  console.log("[auto-decode] invoking claude --print ...");

  const child = spawn(
    "claude",
    [
      "--print",
      prompt,
      "--model",
      "claude-opus-4-7",
      "--mcp-config",
      mcpConfigPath,
      "--dangerously-skip-permissions",
    ],
    {
      env: {
        ...process.env,
        CLAUDE_CODE_OAUTH_TOKEN: config.oauthToken,
        // The orchestrator fans out long research subagents as background
        // tasks; the CLI's default 600s print-mode ceiling kills the session
        // mid-run (observed on the ButlerLiquid utility-audit, 2026-07-09).
        // 0 = wait indefinitely; the AUTO_DECODE_TIMEOUT_MS watchdog below is
        // our own overall bound so "indefinitely" cannot mean "forever".
        CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS:
          process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS ?? "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const s = String(chunk);
    stdout += s;
    process.stdout.write(s); // also stream to terminal
  });
  child.stderr.on("data", (chunk) => {
    const s = String(chunk);
    stderr += s;
    process.stderr.write(s);
  });

  // Overall watchdog: a wedged run must die loudly, not zombie under nohup.
  const timeoutMs = Number(process.env.AUTO_DECODE_TIMEOUT_MS ?? 90 * 60 * 1000);
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    console.error(`[auto-decode] watchdog: run exceeded ${timeoutMs}ms; killing claude`);
    child.kill("SIGTERM");
  }, timeoutMs);

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
  clearTimeout(watchdog);

  const postDiscord = async (content: string): Promise<void> => {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).catch(() => null);
    if (!res?.ok) {
      console.warn(
        `[auto-decode] discord webhook returned ${res?.status ?? "error"} (continuing)`,
      );
    }
  };

  const summaryMatch = stdout.match(/<DISCORD_SUMMARY>([\s\S]*?)<\/DISCORD_SUMMARY>/);
  if (!summaryMatch) {
    // A run that dies without a summary must still page Discord — silence
    // reads as "nothing happened" while a decode is actually stranded.
    const why = timedOut
      ? `watchdog timeout after ${timeoutMs}ms`
      : `claude exited ${exitCode} without a DISCORD_SUMMARY`;
    console.error(`[auto-decode] no DISCORD_SUMMARY block in claude output (${why})`);
    await postDiscord(
      "```\ntarget: " + name + "\nslug: " + slug + "\nresult: crashed\nnotes: " + why + " — see run log on the ops host\n```",
    );
    process.exit(exitCode || 1);
  }
  const summary = summaryMatch[1].trim();

  await postDiscord("```\n" + summary + "\n```");

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[auto-decode] error: ${err.message}`);
  process.exit(1);
});
