// scripts/auto-decode/lib/__tests__/live-guard.test.ts
//
// Opt-in, against the real claude CLI (needs a login, so CI skips it):
//
//   CW_LIVE_CLAUDE=1 pnpm --filter @chainward/auto-decode test -- live-guard
//
// Runs the brief run's exact arguments and reads the tool results, not the
// model's own account. Run it after every Claude Code upgrade on the ops host:
// the self-test proves the hook script works, this proves the CLI still loads it
// and that a hook which cannot run blocks the call instead of letting it through
// (re-review R2 and R4). With CLAUDE_CODE_OAUTH_TOKEN set it uses a fresh config
// dir as the launchers do; without it, the default login.

import { describe, expect, it } from 'vitest';
import { briefClaudeArgs, childEnv, claudeEnv, makeRunDirs, runClaude, type RunGuardOptions } from '../claude-run';

const LIVE = process.env.CW_LIVE_CLAUDE === '1';
const DOCS = 'https://docs.python.org/3/';
const API = 'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006';
const PROMPT = [
  'Permissions check. Make exactly these two WebFetch calls, in this order, one call each.',
  'No retries, no other tools; a refusal is a valid result.',
  `1. WebFetch ${DOCS} and ask for the page title.`,
  `2. WebFetch ${API} and ask for the value of schemaVersion.`,
  'Then say which calls were refused.',
].join('\n');

/** For each URL: true when that WebFetch call was refused, false when it ran. */
async function fetchOutcomes(guard: RunGuardOptions): Promise<Map<string, boolean>> {
  const dirs = await makeRunDirs('cw-live-guard');
  try {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const env = token ? claudeEnv(process.env, { oauthToken: token, configDir: dirs.configDir }) : childEnv(process.env);
    const run = await runClaude({
      args: [...briefClaudeArgs('haiku', guard), '--output-format', 'stream-json', '--verbose', '--no-session-persistence'],
      env,
      cwd: dirs.workDir,
      input: PROMPT,
      timeoutMs: 180_000,
    });
    const urlById = new Map<string, string>();
    const outcomes = new Map<string, boolean>();
    for (const line of run.stdout.split('\n')) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type?: string; message?: { content?: unknown } };
      const blocks = Array.isArray(event.message?.content) ? (event.message.content as Array<Record<string, unknown>>) : [];
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name === 'WebFetch') {
          urlById.set(String(block.id), String((block.input as { url?: unknown })?.url));
        }
        if (block.type === 'tool_result' && urlById.has(String(block.tool_use_id))) {
          outcomes.set(urlById.get(String(block.tool_use_id))!, block.is_error === true);
        }
      }
    }
    return outcomes;
  } finally {
    await dirs.cleanup();
  }
}

describe.skipIf(!LIVE)('live: the run guard on the real CLI', () => {
  it('refuses a documentation host and lets a listed API through', async () => {
    const outcomes = await fetchOutcomes({});
    expect(outcomes.get(DOCS)).toBe(true);
    expect(outcomes.get(API)).toBe(false);
  }, 240_000);

  it('blocks the call, even to a listed API, when the hook cannot run', async () => {
    const outcomes = await fetchOutcomes({ script: '/nonexistent/chainward/run-guard.mjs' });
    expect(outcomes.get(DOCS)).toBe(true);
    expect(outcomes.get(API)).toBe(true);
  }, 240_000);
});
