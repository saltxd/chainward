// scripts/auto-decode/lib/claude-run.ts
//
// How the paid-brief poller (scripts/fulfill-briefs.ts) and the auto-decode
// launcher (scripts/auto-decode/index.ts) start Claude Code. Both runs read text
// that outsiders write: a buyer's order, an agent registry name, and whatever
// pages and API answers the model fetches. They used to run with
// --dangerously-skip-permissions, the homelab MCP (ssh, kubectl, firewall and
// Proxmox writes) and the launcher's whole environment, GitHub token included
// (security audit 2026-11-05, F-001 and B-U07-1). Now every run is:
//
//   - print mode, prompt on stdin (no argument or process listing carries it);
//   - an explicit built-in tool set (--tools): never a shell;
//   - --permission-mode dontAsk: anything not allow-listed is refused, never asked;
//   - an allow-list of scoped rules only: WebFetch to read-only chain and registry
//     APIs, and for auto-decode, Edit of the nine pipeline files by name (a
//     folder-wide rule let a run plant CLAUDE.md for a later session to obey).
//     A bare tool name is never listed, because that would lift the
//     working-directory limit that keeps Read, Glob and Grep inside the run's
//     folders;
//   - a PreToolUse hook (hooks/run-guard.mjs, passed with --settings) that refuses
//     any subagent isolation, "remote" (a cloud session this lockdown would not
//     bind) included, and any WebFetch host off the list, including the
//     documentation hosts Claude Code reaches on its own. It is set to
//     onFailure "block", so a hook that cannot start, crashes or times out
//     refuses the call instead of letting it run, and the launchers run its
//     self-test first so a broken hook stops the run before it starts;
//   - --strict-mcp-config with no --mcp-config: no MCP server at all;
//   - --setting-sources user plus a fresh, empty CLAUDE_CONFIG_DIR: no settings
//     file, CLAUDE.md, memory, plugin or hook from the ops host's ~/.claude (its
//     settings allow-list ssh_exec, kubectl and python3);
//   - an environment built from an allow-list, never the parent's.
//
// Flag names and behaviour checked against Claude Code 2.1.318 (`claude --help`,
// plus print-mode runs: a tool outside --tools does not exist, a WebFetch to an
// unlisted host and a Read or Write outside the allowed paths are refused, and
// the --settings hook runs under --setting-sources user). An older CLI that
// lacks a flag exits on it, so a run fails closed.

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hosts a run may WebFetch: the Base explorer API and the agent registry and market APIs, all read-only. */
export const READ_ONLY_FETCH_DOMAINS = [
  'base.blockscout.com',
  'acpx.virtuals.io',
  'api.virtuals.io',
  'api.dexscreener.com',
] as const;

/** What a claude child inherits from its launcher: process plumbing, never a credential. */
export const INHERITED_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  // TLS trust and egress proxy, in case the host needs them to reach the API.
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
] as const;

/** Run settings a launcher may add on top of the inherited plumbing. */
const EXTRA_ENV_KEYS = ['CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS'] as const;
type ExtraEnvKey = (typeof EXTRA_ENV_KEYS)[number];

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,79}$/;
// Absolute, and nothing the permission-rule or glob syntax would read: no spaces,
// parentheses, wildcards, braces or shell characters.
const SAFE_ABS_PATH_RE = /^\/[A-Za-z0-9._/-]+$/;
const TAG_RE = /^[a-z][a-z0-9_]{0,63}$/;
// JSON.stringify leaves these two as they are; some readers treat them as line breaks.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** The launcher's environment reduced to INHERITED_ENV_KEYS. */
export function childEnv(parent: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = parent[key];
    if (value) env[key] = value;
  }
  return env;
}

export interface ClaudeEnvOptions {
  oauthToken: string;
  /** A fresh, empty directory for this run only (see makeRunDirs). */
  configDir: string;
  extra?: Partial<Record<ExtraEnvKey, string>>;
}

/** The whole environment of a claude child: plumbing, its auth token and its own config dir. */
export function claudeEnv(parent: NodeJS.ProcessEnv, opts: ClaudeEnvOptions): Record<string, string> {
  const env = childEnv(parent);
  for (const [key, value] of Object.entries(opts.extra ?? {})) {
    if (!(EXTRA_ENV_KEYS as readonly string[]).includes(key)) {
      throw new Error(`claudeEnv: ${key} is not an allowed run setting`);
    }
    if (value !== undefined) env[key] = value;
  }
  env.CLAUDE_CODE_OAUTH_TOKEN = opts.oauthToken;
  env.CLAUDE_CONFIG_DIR = opts.configDir;
  return env;
}

function checkModel(model: string): string {
  if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${JSON.stringify(model)}`);
  return model;
}

function checkPath(path: string, what = 'a permission rule'): string {
  if (!SAFE_ABS_PATH_RE.test(path) || path.split('/').includes('..')) {
    throw new Error(`unsupported path for ${what}: ${JSON.stringify(path)}`);
  }
  return path.replace(/\/+$/, '');
}

function webFetchRules(): string[] {
  return READ_ONLY_FETCH_DOMAINS.map((domain) => `WebFetch(domain:${domain})`);
}

// ── The run guard hook ────────────────────────────────────────────────────────

const RUN_GUARD_SCRIPT = fileURLToPath(new URL('../hooks/run-guard.mjs', import.meta.url));

export interface RunGuardOptions {
  /** Node binary for the hook. Default: the launcher's own (process.execPath). */
  node?: string;
  /** Default: scripts/auto-decode/hooks/run-guard.mjs in this checkout. */
  script?: string;
}

/** The hook's shell command: absolute paths and fixed hostnames only, so nothing to quote. */
export function runGuardCommand(opts: RunGuardOptions = {}): string {
  const node = checkPath(opts.node ?? process.execPath, 'the run guard command');
  const script = checkPath(opts.script ?? RUN_GUARD_SCRIPT, 'the run guard command');
  return [node, script, ...READ_ONLY_FETCH_DOMAINS].join(' ');
}

function runGuardSettings(opts: RunGuardOptions = {}): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Agent|Task|WebFetch',
          // By default a hook that cannot start, crashes or times out does not
          // block, and the tool runs (re-review R2). "block" closes that.
          hooks: [{ type: 'command', command: runGuardCommand(opts), onFailure: 'block' }],
        },
      ],
    },
  });
}

/**
 * Throws unless the hook blocks and allows as it should. With onFailure "block"
 * a broken hook stops every guarded call; this catches it before the run starts,
 * so a run does not set out with no working WebFetch or subagents.
 */
export function assertRunGuardWorks(opts: RunGuardOptions = {}): void {
  const [node, script, ...hosts] = runGuardCommand(opts).split(' ');
  const probes: Array<[unknown, number]> = [
    [{ tool_name: 'Agent', tool_input: { prompt: 'x', isolation: 'remote' } }, 2],
    [{ tool_name: 'WebFetch', tool_input: { url: 'https://docs.python.org/3/', prompt: 'x' } }, 2],
    [{ tool_name: 'WebFetch', tool_input: { url: `https://${READ_ONLY_FETCH_DOMAINS[0]}/`, prompt: 'x' } }, 0],
  ];
  for (const [payload, expected] of probes) {
    const r = spawnSync(node!, [script!, ...hosts], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 15_000 });
    if (r.status !== expected) {
      throw new Error(
        `run guard self-test failed: expected exit ${expected}, got ${r.status ?? r.error?.message ?? 'no status'}; refusing to start the run`,
      );
    }
  }
}

function lockedDownArgs(model: string, tools: string, allowedTools: string[], addDirs: string[], guard: RunGuardOptions): string[] {
  return [
    '--print',
    '--model',
    checkModel(model),
    '--tools',
    tools,
    ...(addDirs.length > 0 ? ['--add-dir', ...addDirs] : []),
    '--allowedTools',
    ...allowedTools,
    '--permission-mode',
    'dontAsk',
    '--setting-sources',
    'user',
    '--strict-mcp-config',
    '--settings',
    runGuardSettings(guard),
  ];
}

/**
 * Paid brief: the model only reads public chain and registry APIs and answers on
 * stdout. No files, no shell, no subagents.
 */
export function briefClaudeArgs(model: string, guard: RunGuardOptions = {}): string[] {
  return lockedDownArgs(model, 'WebFetch', webFetchRules(), [], guard);
}

export interface AutoDecodeArgsOptions {
  model: string;
  /** Absolute path of deliverables/<slug>: the run's cwd and the only place it may write. */
  deliverablesDir: string;
  /** Absolute paths the run may read but not write (the prompts, the house-style example). */
  readOnlyDirs: string[];
  /** The files the pipeline writes, by name (DECODE_OUTPUT_FILES); nothing else in the dir is writable. */
  writableFiles: readonly string[];
  guard?: RunGuardOptions;
}

const WRITABLE_FILE_RE = /^[a-z0-9][a-z0-9-]*\.md$/;

/**
 * Auto-decode: subagents read the prompts and the style example, fetch from the
 * read-only APIs and write the pipeline's files in the deliverables dir. No
 * shell: the OG render and the commit are the launcher's job, after it checks
 * the output.
 */
export function autoDecodeClaudeArgs(opts: AutoDecodeArgsOptions): string[] {
  const deliverablesDir = checkPath(opts.deliverablesDir);
  const readOnlyDirs = opts.readOnlyDirs.map((dir) => checkPath(dir));
  if (opts.writableFiles.length === 0) throw new Error('no writable file names given');
  for (const file of opts.writableFiles) {
    if (!WRITABLE_FILE_RE.test(file)) throw new Error(`invalid writable file name: ${JSON.stringify(file)}`);
  }
  // `//abs/path` is the permission-rule form of an absolute path; Edit rules
  // cover Write too. One rule per file, so CLAUDE.md and the like stay refused.
  const writeRules = opts.writableFiles.map((file) => `Edit(/${deliverablesDir}/${file})`);
  return lockedDownArgs(
    opts.model,
    'Read,Glob,Grep,Write,Edit,WebFetch,Task',
    [...writeRules, ...webFetchRules()],
    readOnlyDirs,
    opts.guard ?? {},
  );
}

/**
 * Outside text for a prompt, as JSON between `<tag>` lines. The prompt around it
 * says the block is data, never instructions. `<`, `>` and line separators are
 * escaped, so nothing inside can close the block or start a new line.
 */
export function untrustedBlock(tag: string, data: Record<string, string>): string {
  if (!TAG_RE.test(tag)) throw new Error(`invalid untrusted-block tag: ${JSON.stringify(tag)}`);
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029');
  return `<${tag}>\n${json}\n</${tag}>`;
}

export interface RunDirs {
  /** Empty directory, for a run that needs no files as its cwd. */
  workDir: string;
  /** Empty CLAUDE_CONFIG_DIR for the run. */
  configDir: string;
  /** Deletes both, including the run's session transcript. */
  cleanup: () => Promise<void>;
}

export async function makeRunDirs(prefix: string): Promise<RunDirs> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const workDir = join(root, 'work');
  const configDir = join(root, 'config');
  await mkdir(workDir);
  await mkdir(configDir);
  return { workDir, configDir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export interface ClaudeRun {
  args: string[];
  env: Record<string, string>;
  cwd: string;
  /** The prompt. Written to stdin. */
  input: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ClaudeRunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runClaude(run: ClaudeRun): Promise<ClaudeRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', run.args, { cwd: run.cwd, env: run.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
    }, run.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      run.onStdout?.(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      run.onStderr?.(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(watchdog);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(watchdog);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
    // claude can exit before it has read all of stdin (a bad flag, say); that is
    // reported through the exit code, not as an EPIPE crash of the launcher.
    child.stdin.on('error', () => {});
    child.stdin.end(run.input);
  });
}
