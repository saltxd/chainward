// scripts/auto-decode/hooks/run-guard.mjs
//
// PreToolUse hook for the locked-down brief and decode runs
// (scripts/auto-decode/lib/claude-run.ts passes it with --settings):
//
//   node run-guard.mjs <allowed host> [<allowed host> ...]   (hook payload on stdin)
//
// - Refuses a subagent (Agent/Task) started with any `isolation`. "remote" runs
//   it as a cloud session, outside this process's tool list, permission mode
//   and WebFetch rules; "worktree" is not needed either.
// - Refuses a WebFetch to any host not named on the command line. The allow
//   rules only pre-approve the four read-only APIs; Claude Code also reaches a
//   built-in list of documentation hosts without asking.
//
// Exit 2 blocks the call (the reason goes to stderr, which Claude sees); exit 0
// leaves it to the permission rules. Anything unexpected exits 2. Plain ESM with
// no imports beyond node:, so it runs with the launcher's own node binary.

import { pathToFileURL } from 'node:url';

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

/**
 * @param {unknown} input the PreToolUse payload
 * @param {readonly string[]} allowedHosts
 * @returns {{ block: false } | { block: true, reason: string }}
 */
export function decide(input, allowedHosts) {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || typeof input.tool_name !== 'string') {
    return { block: true, reason: 'run guard: unreadable hook input' };
  }
  const toolInput = input.tool_input !== null && typeof input.tool_input === 'object' ? input.tool_input : {};

  if (SUBAGENT_TOOLS.has(input.tool_name)) {
    if (toolInput.isolation !== undefined && toolInput.isolation !== null) {
      return { block: true, reason: 'Subagent isolation is not allowed in this run (no remote or worktree subagents).' };
    }
    return { block: false };
  }

  if (input.tool_name === 'WebFetch') {
    let url;
    try {
      url = new URL(String(toolInput.url));
    } catch {
      return { block: true, reason: 'WebFetch needs a full http(s) URL in this run.' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { block: true, reason: 'WebFetch needs a full http(s) URL in this run.' };
    }
    const allowed = new Set(allowedHosts.map(normalizeHost));
    const host = normalizeHost(url.hostname);
    if (url.username || url.password || !allowed.has(host)) {
      return { block: true, reason: `WebFetch to ${host || 'that URL'} is not allowed in this run.` };
    }
    return { block: false };
  }

  return { block: false };
}

async function main() {
  const allowedHosts = process.argv.slice(2);
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const verdict = allowedHosts.length === 0 ? { block: true, reason: 'run guard: no allowed hosts given' } : decide(JSON.parse(raw), allowedHosts);
  if (verdict.block) {
    process.stderr.write(`${verdict.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('run guard: could not read the hook input\n');
    process.exit(2);
  });
}
