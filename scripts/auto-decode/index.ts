// scripts/auto-decode/index.ts
//
//   pnpm decode:auto <0xADDRESS|@HANDLE>
//
// Resolves the target in the ACP registry, runs the multi-agent decode pipeline
// in a locked-down Claude session (lib/claude-run.ts), and, only when the run
// reports `ready` and its files pass the launcher's checks, renders the OG card
// and commits the draft locally with a fixed message. It never pushes, deploys
// or posts: publishing is a manual step after the checks in
// docs/decode-publishing-runbook.md.
//
// The registry name is outside text (anyone can set an ACP agent's name). It must
// pass a strict pattern (lib/validators.ts) or the run is refused, and it reaches
// the model only in an untrusted data block. Instructions, paths and the commit
// message use the slug (security audit 2026-11-05, B-U07-1).
//
// Required env: CLAUDE_CODE_OAUTH_TOKEN, DISCORD_WEBHOOK_URL
// Optional env: AUTO_DECODE_TIMEOUT_MS (default 90 min),
//   CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS (default 0, see below)
import { execFile as execFileCb, spawn } from "node:child_process";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveTarget } from "@chainward/decode";
import {
  assertRunGuardWorks,
  autoDecodeClaudeArgs,
  childEnv,
  claudeEnv,
  makeRunDirs,
  runClaude,
  type ClaudeRunResult,
} from "./lib/claude-run.js";
import {
  DECODE_OUTPUT_FILES,
  buildOrchestratorPrompt,
  checkDeliverablesDir,
  checkOgDir,
  commitDecode,
  decodeCommitMessage,
  parseSummary,
  sweepDeliverablesDir,
} from "./lib/decode-run.js";
import { checkSlugCollision, productionDeps as collisionDeps } from "./lib/slug-collision.js";
import { decodeRunInputs, parseTarget, type DecodeRunInputs } from "./lib/validators.js";

const execFile = promisify(execFileCb);

const MODEL = "claude-opus-4-7";

interface Config {
  repoRoot: string;
  oauthToken: string;
  webhookUrl: string;
  timeoutMs: number;
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
    timeoutMs: Number(process.env.AUTO_DECODE_TIMEOUT_MS ?? 90 * 60 * 1000),
  };
}

async function postDiscord(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Model and registry text pass through here: never let it ping anyone.
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  }).catch(() => null);
  if (!res?.ok) {
    console.warn(`[auto-decode] discord webhook returned ${res?.status ?? "error"} (continuing)`);
  }
}

/** Runs a command with the plumbing-only environment; resolves with its exit code. */
function runQuiet(cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: childEnv(process.env), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (c) => (output += String(c)));
    child.stderr.on("data", (c) => (output += String(c)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

/**
 * The launcher's side of a `ready` run: check the files, render the OG card,
 * commit the draft. Returns a one-line status for Discord. Never pushes.
 */
async function finalize(repoRoot: string, slug: string): Promise<string> {
  const problem = await checkDeliverablesDir(join(repoRoot, "deliverables", slug), slug);
  if (problem) return `halt-output-invalid: ${problem}; nothing rendered or committed`;

  let render = await runQuiet("pnpm", ["decode:og-render", slug], repoRoot);
  if (render.code !== 0) render = await runQuiet("pnpm", ["decode:og-render", slug], repoRoot);
  if (render.code !== 0) return `halt-og-render: exit ${render.code}: ${render.output.trim().slice(-300)}`;
  const ogProblem = await checkOgDir(join(repoRoot, "apps/web/public/decodes", slug));
  if (ogProblem) return `halt-og-render: ${ogProblem}`;

  const git = async (args: string[]): Promise<string> =>
    (await execFile("git", args, { cwd: repoRoot, env: childEnv(process.env) })).stdout;
  try {
    const sha = await commitDecode(slug, git);
    return (
      `committed ${sha} "${decodeCommitMessage(slug)}" on the ops checkout; NOT pushed. ` +
      "Publishing is manual, after the checks in docs/decode-publishing-runbook.md."
    );
  } catch (err) {
    return `halt-commit: ${err instanceof Error ? err.message : String(err)}`;
  }
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

  let run: DecodeRunInputs;
  try {
    run = decodeRunInputs(resolved);
  } catch (err) {
    // A registry name or address outside the strict shape: refuse the run.
    console.error(`[auto-decode] refused: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(5);
  }
  const { address, name, slug } = run;

  console.log(`[auto-decode] target=${rawTarget} → name=${name} address=${address}`);
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
      const probe = spawn("claude", ["--version"], { stdio: "ignore", env: childEnv(process.env) });
      probe.on("error", reject);
      probe.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`claude --version exited ${code}`)),
      );
    });
  } catch (err) {
    console.error(
      `[auto-decode] claude CLI not runnable (${err instanceof Error ? err.message : String(err)}) — is it on PATH?`,
    );
    process.exit(4);
  }

  // The PreToolUse hook that refuses remote/worktree subagents and off-list
  // WebFetch hosts. A hook that cannot start does not block, so prove it works.
  try {
    assertRunGuardWorks();
  } catch (err) {
    console.error(`[auto-decode] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(6);
  }

  await mkdir(join(config.repoRoot, "deliverables", slug), { recursive: true });
  // Real paths: the write rule and the read-only dirs are matched against them.
  const repoRoot = await realpath(config.repoRoot);
  const deliverables = await realpath(join(repoRoot, "deliverables", slug));
  const readOnlyDirs = [
    await realpath(join(repoRoot, "scripts/auto-decode-prompts")),
    await realpath(join(repoRoot, "deliverables/aixbt")),
  ];
  console.log(`[auto-decode] created ${deliverables}`);

  const promptTemplate = await readFile(join(repoRoot, "scripts/auto-decode-prompts/orchestrator.md"), "utf-8");
  const prompt = buildOrchestratorPrompt(promptTemplate, { address, name, slug, deliverablesDir: deliverables, repoRoot });

  console.log("[auto-decode] invoking claude --print (no shell, no MCP, writes only in the deliverables dir) ...");

  const dirs = await makeRunDirs("cw-auto-decode");
  let result: ClaudeRunResult;
  try {
    result = await runClaude({
      args: autoDecodeClaudeArgs({
        model: MODEL,
        deliverablesDir: deliverables,
        readOnlyDirs,
        writableFiles: DECODE_OUTPUT_FILES,
      }),
      env: claudeEnv(process.env, {
        oauthToken: config.oauthToken,
        configDir: dirs.configDir,
        // The orchestrator fans out long research subagents as background
        // tasks; the CLI's default 600s print-mode ceiling kills the session
        // mid-run (observed on the ButlerLiquid utility-audit, 2026-07-09).
        // 0 = wait indefinitely; the AUTO_DECODE_TIMEOUT_MS watchdog is our
        // own overall bound so "indefinitely" cannot mean "forever".
        extra: { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS ?? "0" },
      }),
      cwd: deliverables,
      input: prompt,
      timeoutMs: config.timeoutMs,
      onStdout: (s) => process.stdout.write(s), // also stream to terminal
      onStderr: (s) => process.stderr.write(s),
    });
  } finally {
    await dirs.cleanup();
  }
  const { stdout, stderr, timedOut } = result;
  const exitCode = result.code;
  if (timedOut) console.error(`[auto-decode] watchdog: run exceeded ${config.timeoutMs}ms; killed claude`);

  // Whatever the result, nothing but the pipeline's own files stays in the
  // folder: a planted CLAUDE.md left after a halt was obeyed by a later session
  // that only opened the folder. The write rules should make this a no-op.
  const removed = await sweepDeliverablesDir(deliverables);
  const sweptNote = removed.length
    ? "removed files the run was not allowed to leave: " +
      removed
        .slice(0, 5)
        .map((n) => n.replace(/[^A-Za-z0-9._-]/g, "?").slice(0, 40))
        .join(", ")
    : "";
  if (sweptNote) console.error(`[auto-decode] ${sweptNote}`);

  const summary = parseSummary(stdout);
  if (!summary) {
    // A run that dies without a summary must still page Discord — silence
    // reads as "nothing happened" while a decode is actually stranded.
    const why = timedOut
      ? `watchdog timeout after ${config.timeoutMs}ms`
      : `claude exited ${exitCode} without a DISCORD_SUMMARY`;
    console.error(`[auto-decode] no DISCORD_SUMMARY block in claude output (${why})`);
    // Attach the tail of what the child actually said, so the cause is visible
    // without an SSH round-trip. Discord hard-caps a message at 2000 chars, so
    // send the tail only: the fatal error is at the end, and the budget below
    // leaves room for the target/slug/result header.
    const TAIL_CHARS = 900;
    const tail = (stderr.trim() || stdout.trim()).slice(-TAIL_CHARS);
    await postDiscord(
      config.webhookUrl,
      "```\ntarget: " +
        address +
        "\nslug: " +
        slug +
        "\nresult: crashed\nnotes: " +
        why +
        (sweptNote ? "\nlauncher: " + sweptNote : "") +
        (tail ? "\n--- output tail ---\n" + tail : " — no output captured") +
        "\n```",
    );
    process.exit(exitCode || 1);
  }

  // The model's word alone commits nothing: finalize() re-checks its files, and
  // a run that tried to leave anything else is not committed at all.
  let launcher: string;
  if (sweptNote) launcher = `halt-output-invalid: ${sweptNote}; nothing rendered or committed`;
  else if (summary.result === "ready") launcher = await finalize(repoRoot, slug);
  else launcher = `nothing committed (result: ${summary.result ?? "unrecognized"})`;
  console.log(`[auto-decode] launcher: ${launcher}`);

  await postDiscord(config.webhookUrl, "```\n" + summary.block + "\nlauncher: " + launcher + "\n```");

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[auto-decode] error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
