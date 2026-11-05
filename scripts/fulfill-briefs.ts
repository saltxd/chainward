// scripts/fulfill-briefs.ts
//
// Auto-fulfillment poller for paid Intel Brief orders. Runs on the ops host (has
// claude + gh). Per cycle: pull paid orders from the chainward ops API, claim
// each atomically, run a brief decode via Claude, deliver via the order's
// method, verify, then mark fulfilled.
//
//   every order         → the written markdown brief is stored ON the order via
//                         the ops API and rendered in-app to the paying wallet
//                         ("Your requests" on /request-brief). No human in the loop.
//   method=x            → ALSO posted as a public thread from @chainwardai tagging
//                         the buyer, via the chainward-bot workflow.
//   any other method    → private; a copy is mirrored to the ops Discord webhook
//                         so the buyer can be pinged at their Telegram/email.
//
// The order's target and contact are buyer text. They are re-checked here
// (auto-decode/lib/brief-run.ts) and reach the model only as an untrusted data
// block. The Claude run itself is locked down (auto-decode/lib/claude-run.ts):
// its only tool is WebFetch, allow-listed for four read-only APIs, and a hook
// refuses every other host, including the documentation sites Claude Code
// otherwise fetches without asking. No MCP server, no settings from ~/.claude,
// and an environment that holds its own OAuth token and no other secret.
// GH_TOKEN, OPS_API_KEY and the webhook stay with this script.
//
//   DRY_RUN=false pnpm brief:fulfill
//
// Required env: OPS_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN (used only by this
//   script's own `gh workflow run` for public X delivery: a fine-grained token
//   limited to Actions on BOT_REPO is enough)
// Optional env: OPS_API_URL (default https://api.chainward.ai), BOT_REPO
//   (default saltxd/chainward-bot), OPS_DISCORD_WEBHOOK (required for private
//   delivery), BRIEF_MODEL (default claude-opus-4-7), MAX_ORDERS (default 3),
//   BRIEF_TIMEOUT_MS (default 30 min per order), DRY_RUN (default true)
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chunkForDiscord, parseBriefOutput, type BriefOutput } from './auto-decode/lib/brief-output.js';
import { buildBriefPrompt, parseQueuedOrder, type BriefRunInput, type QueuedBriefOrder } from './auto-decode/lib/brief-run.js';
import {
  assertRunGuardWorks,
  briefClaudeArgs,
  childEnv,
  claudeEnv,
  makeRunDirs,
  runClaude,
} from './auto-decode/lib/claude-run.js';

interface Config {
  repoRoot: string;
  opsUrl: string;
  opsKey: string;
  oauthToken: string;
  ghToken: string;
  botRepo: string;
  opsWebhook: string | null;
  model: string;
  maxOrders: number;
  timeoutMs: number;
  dryRun: boolean;
}

interface BriefOrder extends QueuedBriefOrder {
  amountUsdc: number;
}

function loadConfig(): Config {
  const req = (n: string): string => {
    const v = process.env[n];
    if (!v) throw new Error(`missing env var: ${n}`);
    return v;
  };
  return {
    repoRoot: process.cwd(),
    opsUrl: process.env.OPS_API_URL ?? 'https://api.chainward.ai',
    opsKey: req('OPS_API_KEY'),
    oauthToken: req('CLAUDE_CODE_OAUTH_TOKEN'),
    ghToken: req('GH_TOKEN'),
    botRepo: process.env.BOT_REPO ?? 'saltxd/chainward-bot',
    opsWebhook: process.env.OPS_DISCORD_WEBHOOK ?? null,
    model: process.env.BRIEF_MODEL ?? 'claude-opus-4-7',
    maxOrders: Number(process.env.MAX_ORDERS ?? 3),
    timeoutMs: Number(process.env.BRIEF_TIMEOUT_MS ?? 30 * 60 * 1000),
    dryRun: process.env.DRY_RUN !== 'false',
  };
}

function log(...a: unknown[]) {
  console.log('[fulfill-briefs]', ...a);
}

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += String(c)));
    child.stderr.on('data', (c) => (stderr += String(c)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function ops<T>(cfg: Config, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${cfg.opsUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-ops-key': cfg.opsKey, ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ops ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

async function setStatus(
  cfg: Config,
  id: string,
  status: 'fulfilling' | 'fulfilled' | 'failed',
  extra: { deliveryRef?: string; error?: string; briefMarkdown?: string } = {},
) {
  return ops<{ success: boolean; claimed?: boolean }>(cfg, `/api/brief/ops/orders/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, ...extra }),
  });
}

// Run the brief decode via Claude and parse the brief (and thread, if public).
async function decodeOrder(cfg: Config, input: BriefRunInput): Promise<BriefOutput> {
  const tpl = await readFile(join(cfg.repoRoot, 'scripts/auto-decode-prompts/brief.md'), 'utf-8');
  const prompt = buildBriefPrompt(tpl, input);
  // An empty cwd and an empty config dir per run: nothing on disk for the model
  // to read, and the session transcript is deleted with the dirs.
  const dirs = await makeRunDirs('cw-brief');
  try {
    log(`decoding ${input.target} (order ${input.orderId.slice(0, 8)}, ${input.delivery}) via claude…`);
    const { code, stdout, stderr, timedOut } = await runClaude({
      args: briefClaudeArgs(cfg.model),
      env: claudeEnv(process.env, { oauthToken: cfg.oauthToken, configDir: dirs.configDir }),
      cwd: dirs.workDir,
      input: prompt,
      timeoutMs: cfg.timeoutMs,
    });
    if (timedOut) throw new Error(`claude run exceeded ${cfg.timeoutMs} ms`);
    if (code !== 0) throw new Error(`claude exited ${code}: ${stderr.slice(-400)}`);
    return parseBriefOutput(
      stdout,
      input.delivery === 'public' ? { needThread: true, buyerHandle: input.contact } : { needThread: false },
    );
  } finally {
    await dirs.cleanup();
  }
}

// Dispatch the thread via the chainward-bot workflow and confirm it posted.
async function deliverX(cfg: Config, thread: string[]): Promise<string> {
  const json = JSON.stringify(thread);
  const ghEnv = { ...childEnv(process.env), GH_TOKEN: cfg.ghToken };
  log(`dispatching ${thread.length}-tweet thread to ${cfg.botRepo} (dry_run=${cfg.dryRun})`);
  const r = await run(
    'gh',
    ['workflow', 'run', 'post-digest.yml', '--repo', cfg.botRepo, '-f', `dry_run=${cfg.dryRun}`, '-f', `thread_json=${json}`],
    ghEnv,
  );
  if (r.code !== 0) throw new Error(`gh workflow run failed: ${r.stderr.slice(-300)}`);
  if (cfg.dryRun) return 'dry-run (not posted)';

  // wait for the run, confirm success, extract tweet id
  await new Promise((res) => setTimeout(res, 9000));
  const list = await run('gh', ['run', 'list', '--repo', cfg.botRepo, '--workflow=post-digest.yml', '--limit', '1', '--json', 'databaseId'], ghEnv);
  const runId = JSON.parse(list.stdout || '[]')[0]?.databaseId;
  if (!runId) throw new Error('could not find bot run id');
  await run('gh', ['run', 'watch', String(runId), '--repo', cfg.botRepo, '--exit-status', '--interval', '10'], ghEnv);
  const logs = await run('gh', ['run', 'view', String(runId), '--repo', cfg.botRepo, '--log'], ghEnv);
  const idm = logs.stdout.match(/First tweet id:\s*(\d+)/) || logs.stdout.match(/Posted tweet\s*(\d+)/);
  if (!idm) throw new Error('bot run finished but no tweet id found (post may have failed)');
  return `x:${idm[1]}`;
}

async function postDiscord(webhook: string, content: string): Promise<void> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Order and model text pass through here: never let it ping anyone.
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`ops webhook ${res.status}`);
}

// PRIVATE delivery is IN-APP: the brief is attached to the order (the API stores
// it; "Your requests" on /request-brief renders it to the paying wallet). The ops
// channel also gets a copy so the buyer can be pinged at their contact and so
// nothing is lost if the API write fails.
async function mirrorPrivateToOps(cfg: Config, input: BriefRunInput, markdown: string): Promise<void> {
  if (!cfg.opsWebhook) return;
  const parts = chunkForDiscord(markdown, 1900);
  const header =
    `📬 **Private brief delivered in-app** (order ${input.orderId.slice(0, 8)}) — ping ${input.contact} ` +
    `(${input.contactMethod}): "Your ChainWard brief is ready at chainward.ai/request-brief". ` +
    `Copy follows in ${parts.length} part${parts.length === 1 ? '' : 's'}.`;
  if (cfg.dryRun) {
    log(`dry-run: would mirror ${parts.length} part(s) to ops webhook`);
    return;
  }
  await postDiscord(cfg.opsWebhook, header);
  for (const part of parts) await postDiscord(cfg.opsWebhook, part);
}

async function fulfillOne(cfg: Config, order: BriefOrder): Promise<void> {
  const claim = await setStatus(cfg, order.id, 'fulfilling');
  if (claim.claimed === false) {
    log(`order ${order.id.slice(0, 8)} already claimed — skipping`);
    return;
  }
  try {
    // Refuses (and so fails) an order whose target or contact is not in the
    // strict shape, before any model run.
    const input = parseQueuedOrder(order);
    const { markdown, thread, summary } = await decodeOrder(cfg, input);
    log(`decoded: ${summary || '(no summary)'}`);
    let deliveryRef: string;
    if (input.delivery === 'public') {
      if (!thread) throw new Error('public order decoded without a thread');
      deliveryRef = await deliverX(cfg, thread);
    } else {
      deliveryRef = cfg.dryRun ? 'dry-run (in-app)' : 'in-app';
    }
    // The written brief is stored on the order for BOTH delivery modes — public
    // buyers keep the long-form brief in their account too.
    await setStatus(cfg, order.id, 'fulfilled', { deliveryRef, briefMarkdown: markdown });
    if (input.delivery === 'private') {
      await mirrorPrivateToOps(cfg, input, markdown).catch((e) => log(`ops mirror failed: ${e}`));
    }
    log(`✅ fulfilled ${order.id.slice(0, 8)} → ${deliveryRef}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`❌ failed ${order.id.slice(0, 8)}: ${msg}`);
    await setStatus(cfg, order.id, 'failed', { error: msg }).catch(() => {});
    if (cfg.opsWebhook) {
      // The stored target may be pre-check free text: quoted and cut, never raw.
      const target = JSON.stringify(String(order.target).slice(0, 60));
      await postDiscord(
        cfg.opsWebhook,
        `⚠️ Brief fulfillment FAILED — order ${order.id.slice(0, 8)} (${target}): ${msg.slice(0, 400)}`,
      ).catch(() => {});
    }
  }
}

async function main() {
  const cfg = loadConfig();
  // The hook that keeps WebFetch on the four hosts. It blocks on failure, so a
  // broken hook would fail every order: prove it works before claiming any.
  assertRunGuardWorks();
  const { orders } = await ops<{ success: boolean; orders: BriefOrder[] }>(cfg, `/api/brief/ops/queue?limit=${cfg.maxOrders}`);
  if (!orders.length) {
    log('no paid orders to fulfill');
    return;
  }
  log(`${orders.length} order(s) to fulfill (dryRun=${cfg.dryRun})`);
  for (const order of orders) {
    await fulfillOne(cfg, order);
  }
}

main().catch((err) => {
  console.error('[fulfill-briefs] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
