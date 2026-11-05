// scripts/auto-decode/lib/decode-run.ts
//
// The parts of an auto-decode run that the launcher (scripts/auto-decode/index.ts)
// does itself, kept free of I/O where possible so they are unit-tested:
//
//   - the orchestrator prompt: trusted run values in the instructions, the
//     registry name only in an untrusted block at the end;
//   - reading the run's result from its DISCORD_SUMMARY;
//   - checking what the run wrote before anything is committed;
//   - the commit itself: fixed message, fixed paths, no push.
//
// The model has no shell and no git (lib/claude-run.ts). Publishing (push, launch
// tweet) is a manual step after the checks in docs/decode-publishing-runbook.md.

import { chmod, lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { untrustedBlock } from './claude-run.js';
import { assertSlug } from './validators.js';

/**
 * Every file the pipeline writes in deliverables/<slug>. The run may write these
 * names and nothing else (one permission rule each), and the launcher removes
 * anything else it finds there after every run.
 */
export const DECODE_OUTPUT_FILES = [
  'identity-chain.md',
  'token-economics.md',
  'utility-audit.md',
  'decode.md',
  'tweet.md',
  'writer-retry-brief.md',
  'verification-citation.md',
  'verification-failure-mode.md',
  'verification-voice.md',
] as const;

export interface OrchestratorRun {
  address: string;
  /** The checked display name. Goes only into the untrusted block. */
  name: string;
  slug: string;
  deliverablesDir: string;
  repoRoot: string;
  /** The launcher's chain-facts file (see writeFactsFile): read-only to the run. */
  factsFile: string;
}

// The launcher fills these in. All five are values it built or checked itself.
const RUN_PLACEHOLDERS: Array<[string, keyof OrchestratorRun]> = [
  ['<TARGET_ADDRESS>', 'address'],
  ['<SLUG>', 'slug'],
  ['<DELIVERABLES_DIR>', 'deliverablesDir'],
  ['<REPO_ROOT>', 'repoRoot'],
  ['<FACTS_FILE>', 'factsFile'],
];

/**
 * Writes the chain-facts pack (lib/chain-facts.ts) to <dir>/facts.json, read-only,
 * and returns the path. The run reads it through a read-only --add-dir; it has no
 * rule that lets it write there.
 */
export async function writeFactsFile(dir: string, pack: unknown): Promise<string> {
  const file = join(dir, 'facts.json');
  await writeFile(file, JSON.stringify(pack, null, 2) + '\n', { mode: 0o444 });
  await chmod(file, 0o444);
  return file;
}

export function registryBlock(run: Pick<OrchestratorRun, 'name' | 'address'>): string {
  return untrustedBlock('untrusted_registry_data', { display_name: run.name, wallet_address: run.address });
}

export function buildOrchestratorPrompt(template: string, run: OrchestratorRun): string {
  if (template.includes('<TARGET_NAME>')) {
    throw new Error('orchestrator template still has the <TARGET_NAME> placeholder; the name goes only in the untrusted block');
  }
  let instructions = template;
  for (const [placeholder, key] of RUN_PLACEHOLDERS) instructions = instructions.split(placeholder).join(run[key]);
  return `${instructions}${instructions.endsWith('\n') ? '' : '\n'}\n${registryBlock(run)}\n`;
}

/** What the orchestrator may report. Anything else is treated as no result. */
export const RUN_RESULTS = [
  'ready',
  'halt-research-failed',
  'halt-writer-failed',
  'halt-verifier-failed',
  'halt-verification',
] as const;
export type RunResult = (typeof RUN_RESULTS)[number];

export function parseSummary(stdout: string): { block: string; result: RunResult | null } | null {
  const blocks = [...stdout.matchAll(/<DISCORD_SUMMARY>([\s\S]*?)<\/DISCORD_SUMMARY>/g)];
  const block = blocks.at(-1)?.[1]?.trim();
  if (block === undefined) return null;
  const raw = /^result:\s*(\S+)\s*$/m.exec(block)?.[1];
  const result = (RUN_RESULTS as readonly string[]).includes(raw ?? '') ? (raw as RunResult) : null;
  return { block, result };
}

export function decodeCommitMessage(slug: string): string {
  return `feat: add decode ${assertSlug(slug)}`;
}

export type GitRunner = (args: string[]) => Promise<string>;

/** Commits the draft on the current branch. Returns the short sha. Never pushes. */
export async function commitDecode(slug: string, git: GitRunner): Promise<string> {
  const message = decodeCommitMessage(slug);
  const paths = [`deliverables/${slug}`, `apps/web/public/decodes/${slug}`];
  await git(['add', '--', ...paths]);
  // Pathspec commit: only these paths, whatever else is staged in the checkout.
  await git(['commit', '-m', message, '--', ...paths]);
  return (await git(['rev-parse', '--short', 'HEAD'])).trim();
}

// ── Output checks ──────────────────────────────────────────────────────────────
// Each returns null when fine, or the problem in a few words.

export interface DirEntry {
  name: string;
  /** False for a symlink or directory. */
  isFile: boolean;
  size: number;
}

const OUTPUT_FILES: ReadonlySet<string> = new Set(DECODE_OUTPUT_FILES);
const MAX_DELIVERABLE_BYTES = 1_000_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function checkDeliverableEntries(entries: DirEntry[]): string | null {
  for (const e of entries) {
    if (!OUTPUT_FILES.has(e.name)) return `${JSON.stringify(e.name)} is not a pipeline file`;
    if (!e.isFile) return `${e.name} is not a regular file`;
    if (e.size > MAX_DELIVERABLE_BYTES) return `${e.name} is larger than ${MAX_DELIVERABLE_BYTES} bytes`;
  }
  for (const required of ['decode.md', 'tweet.md']) {
    if (!entries.some((e) => e.name === required)) return `${required} is missing`;
  }
  return null;
}

export function checkDecodeFrontmatter(md: string, slug: string): string | null {
  // Exactly `---`: gray-matter would run `---js` front matter as code.
  if (!md.startsWith('---\n')) return 'decode.md does not open with plain --- YAML front matter';
  const end = md.indexOf('\n---', 3);
  if (end === -1) return 'decode.md front matter is not closed';
  const fields = new Map<string, string>();
  for (const line of md.slice(4, end).split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m?.[1]) fields.set(m[1], (m[2] ?? '').trim().replace(/^"(.*)"$/, '$1'));
  }
  if (fields.get('slug') !== slug) return `front matter slug is not ${slug}`;
  if (!fields.get('title')) return 'front matter has no title';
  if (!fields.get('subtitle')) return 'front matter has no subtitle';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.get('date') ?? '')) return 'front matter date is not YYYY-MM-DD';
  return null;
}

export function checkTweets(text: string): string | null {
  const tweets = text
    .split(/^---$/m)
    .map((t) => t.trim())
    .filter(Boolean);
  return tweets.length === 5 ? null : `tweet.md has ${tweets.length} tweets, expected 5`;
}

/** A blocking verifier must have finished with no correctable or fundamental failure. */
export function checkVerifierReport(text: string, doneTag: string): string | null {
  const m = new RegExp(`^${doneTag}: pass=(\\d+) correctable=(\\d+) fundamental=(\\d+)\\s*$`, 'm').exec(text);
  if (!m) return `no ${doneTag} line`;
  return m[2] === '0' && m[3] === '0' ? null : `${doneTag} reports failures (correctable=${m[2]} fundamental=${m[3]})`;
}

export function isPng(buf: Buffer): boolean {
  return buf.length >= PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

async function entriesOf(dir: string): Promise<DirEntry[]> {
  const out: DirEntry[] = [];
  for (const name of await readdir(dir)) {
    const st = await lstat(join(dir, name));
    out.push({ name, isFile: st.isFile(), size: st.size });
  }
  return out;
}

/**
 * Removes everything in deliverables/<slug> that is not a pipeline file held as
 * a regular file: a planted CLAUDE.md or AGENTS.md, a .claude/ folder, a symlink
 * (the link goes, never its target). Returns the removed names, sorted. Run after
 * every decode, halts and crashes included, so a later session that opens the
 * folder never loads leftover instructions.
 */
export async function sweepDeliverablesDir(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const removed: string[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const st = await lstat(path);
    if (OUTPUT_FILES.has(name) && st.isFile()) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(name);
  }
  return removed.sort();
}

/** Everything the launcher checks in deliverables/<slug> before rendering and committing. */
export async function checkDeliverablesDir(dir: string, slug: string): Promise<string | null> {
  const problem = checkDeliverableEntries(await entriesOf(dir));
  if (problem) return problem;
  const read = (name: string) => readFile(join(dir, name), 'utf-8');
  return (
    checkDecodeFrontmatter(await read('decode.md'), slug) ??
    checkTweets(await read('tweet.md')) ??
    checkVerifierReport(await read('verification-citation.md').catch(() => ''), 'CITATION_VERIFIER_DONE') ??
    checkVerifierReport(await read('verification-failure-mode.md').catch(() => ''), 'FAILURE_MODE_VERIFIER_DONE')
  );
}

/** apps/web/public/decodes/<slug> after the OG render: og.png and nothing else. */
export async function checkOgDir(dir: string): Promise<string | null> {
  const entries = await entriesOf(dir).catch(() => null);
  if (!entries) return `${dir} is missing`;
  if (entries.length !== 1 || entries[0]?.name !== 'og.png' || !entries[0].isFile) return 'expected og.png and nothing else';
  return isPng(await readFile(join(dir, 'og.png'))) ? null : 'og.png is not a PNG';
}
