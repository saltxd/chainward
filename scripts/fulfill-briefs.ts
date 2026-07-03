// scripts/fulfill-briefs.ts
//
// Auto-fulfillment poller for paid Intel Brief orders. Runs on the ops host (has
// claude + gh). Per cycle: pull paid orders from the chainward ops API, claim
// each atomically, run a brief decode via Claude, deliver via the order's
// method (X = thread from @chainwardai tagging the buyer), verify the post
// landed, then mark fulfilled. No human in the loop.
//
//   DRY_RUN=false pnpm brief:fulfill
//
// Required env: OPS_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN
// Optional env: OPS_API_URL (default https://api.chainward.ai), BOT_REPO
//   (default saltxd/chainward-bot), OPS_DISCORD_WEBHOOK, BRIEF_MODEL
//   (default claude-opus-4-7), MAX_ORDERS (default 3), DRY_RUN (default true)
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  dryRun: boolean;
}

interface BriefOrder {
  id: string;
  target: string;
  targetKind: 'address' | 'handle';
  contact: string;
  contactMethod: 'email' | 'telegram' | 'x' | 'discord' | 'other';
  notes: string | null;
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
  extra: { deliveryRef?: string; error?: string } = {},
) {
  return ops<{ success: boolean; claimed?: boolean }>(cfg, `/api/brief/ops/orders/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, ...extra }),
  });
}

// Run the brief decode via Claude and parse the thread it returns.
async function decodeToThread(cfg: Config, order: BriefOrder): Promise<{ thread: string[]; summary: string }> {
  const tpl = await readFile(join(cfg.repoRoot, 'scripts/auto-decode-prompts/brief.md'), 'utf-8');
  const handle = order.contact.replace(/^@/, '');
  const prompt = tpl.replace(/<TARGET>/g, order.target).replace(/<HANDLE>/g, handle);
  const mcpConfig = join(cfg.repoRoot, 'scripts/auto-decode.mcp.json');

  log(`decoding ${order.target} (order ${order.id.slice(0, 8)}) via claude…`);
  const { code, stdout, stderr } = await run(
    'claude',
    ['--print', prompt, '--model', cfg.model, '--mcp-config', mcpConfig, '--dangerously-skip-permissions'],
    { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: cfg.oauthToken },
  );
  if (code !== 0) throw new Error(`claude exited ${code}: ${stderr.slice(-400)}`);

  const m = [...stdout.matchAll(/<BRIEF_THREAD>([\s\S]*?)<\/BRIEF_THREAD>/g)].pop();
  if (!m) throw new Error('no <BRIEF_THREAD> block in claude output');
  let thread: unknown;
  try {
    thread = JSON.parse(m[1].trim());
  } catch (e) {
    throw new Error(`BRIEF_THREAD not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(thread) || thread.length < 2 || thread.length > 4 || !thread.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 280)) {
    throw new Error(`BRIEF_THREAD invalid shape (got ${JSON.stringify(thread).slice(0, 120)})`);
  }
  const sm = stdout.match(/<BRIEF_SUMMARY>([\s\S]*?)<\/BRIEF_SUMMARY>/);
  return { thread: thread as string[], summary: sm ? sm[1].trim() : '' };
}

// Dispatch the thread via the chainward-bot workflow and confirm it posted.
async function deliverX(cfg: Config, thread: string[]): Promise<string> {
  const json = JSON.stringify(thread);
  log(`dispatching ${thread.length}-tweet thread to ${cfg.botRepo} (dry_run=${cfg.dryRun})`);
  const r = await run(
    'gh',
    ['workflow', 'run', 'post-digest.yml', '--repo', cfg.botRepo, '-f', `dry_run=${cfg.dryRun}`, '-f', `thread_json=${json}`],
    { ...process.env, GH_TOKEN: cfg.ghToken },
  );
  if (r.code !== 0) throw new Error(`gh workflow run failed: ${r.stderr.slice(-300)}`);
  if (cfg.dryRun) return 'dry-run (not posted)';

  // wait for the run, confirm success, extract tweet id
  await new Promise((res) => setTimeout(res, 9000));
  const list = await run('gh', ['run', 'list', '--repo', cfg.botRepo, '--workflow=post-digest.yml', '--limit', '1', '--json', 'databaseId'], { ...process.env, GH_TOKEN: cfg.ghToken });
  const runId = JSON.parse(list.stdout || '[]')[0]?.databaseId;
  if (!runId) throw new Error('could not find bot run id');
  await run('gh', ['run', 'watch', String(runId), '--repo', cfg.botRepo, '--exit-status', '--interval', '10'], { ...process.env, GH_TOKEN: cfg.ghToken });
  const logs = await run('gh', ['run', 'view', String(runId), '--repo', cfg.botRepo, '--log'], { ...process.env, GH_TOKEN: cfg.ghToken });
  const idm = logs.stdout.match(/First tweet id:\s*(\d+)/) || logs.stdout.match(/Posted tweet\s*(\d+)/);
  if (!idm) throw new Error('bot run finished but no tweet id found (post may have failed)');
  return `x:${idm[1]}`;
}

async function deliverWebhook(cfg: Config, order: BriefOrder, thread: string[]): Promise<string> {
  if (!cfg.opsWebhook) throw new Error(`no delivery path for method=${order.contactMethod} (set OPS_DISCORD_WEBHOOK)`);
  const content = `📦 **Brief ready — method=${order.contactMethod}, contact=${order.contact}** (order ${order.id.slice(0, 8)})\n\n${thread.join('\n\n')}`;
  const res = await fetch(cfg.opsWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }) });
  if (!res.ok) throw new Error(`ops webhook ${res.status}`);
  return `ops-webhook (method=${order.contactMethod})`;
}

async function fulfillOne(cfg: Config, order: BriefOrder): Promise<void> {
  const claim = await setStatus(cfg, order.id, 'fulfilling');
  if (claim.claimed === false) {
    log(`order ${order.id.slice(0, 8)} already claimed — skipping`);
    return;
  }
  try {
    const { thread, summary } = await decodeToThread(cfg, order);
    log(`decoded: ${summary || '(no summary)'}`);
    const deliveryRef = order.contactMethod === 'x' ? await deliverX(cfg, thread) : await deliverWebhook(cfg, order, thread);
    await setStatus(cfg, order.id, 'fulfilled', { deliveryRef });
    log(`✅ fulfilled ${order.id.slice(0, 8)} → ${deliveryRef}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`❌ failed ${order.id.slice(0, 8)}: ${msg}`);
    await setStatus(cfg, order.id, 'failed', { error: msg }).catch(() => {});
    if (cfg.opsWebhook) {
      await fetch(cfg.opsWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `⚠️ Brief fulfillment FAILED — order ${order.id.slice(0, 8)} (${order.target}): ${msg.slice(0, 400)}` }) }).catch(() => {});
    }
  }
}

async function main() {
  const cfg = loadConfig();
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
