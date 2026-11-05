// scripts/auto-decode/lib/__tests__/run-guard.test.ts
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decide } from '../../hooks/run-guard.mjs';
import { READ_ONLY_FETCH_DOMAINS, assertRunGuardWorks } from '../claude-run';

// The PreToolUse hook both runs load through --settings (review of
// fix/llm-run-hardening, Important 2 and Minor 1): the Agent tool still offers
// `isolation: "worktree" | "remote"`, and a remote subagent is a cloud session
// this process's lockdown does not bind. WebFetch also reaches the documentation
// hosts Claude Code pre-approves on its own, past the four-host allow-list.

const HOOK = fileURLToPath(new URL('../../hooks/run-guard.mjs', import.meta.url));
const HOSTS = [...READ_ONLY_FETCH_DOMAINS];

const agent = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: input });
const fetchOf = (url: unknown) => ({ hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url, prompt: 'x' } });

describe('decide', () => {
  it('refuses a subagent with any isolation, remote and worktree alike', () => {
    for (const isolation of ['remote', 'worktree', 'anything-new']) {
      expect(decide(agent({ prompt: 'x', isolation }), HOSTS)).toMatchObject({ block: true });
      expect(decide({ tool_name: 'Task', tool_input: { prompt: 'x', isolation } }, HOSTS)).toMatchObject({ block: true });
    }
  });

  it('lets a plain subagent run, background or not', () => {
    expect(decide(agent({ prompt: 'x', subagent_type: 'general-purpose' }), HOSTS)).toEqual({ block: false });
    expect(decide(agent({ prompt: 'x', run_in_background: true }), HOSTS)).toEqual({ block: false });
    expect(decide(agent({ prompt: 'x', isolation: null }), HOSTS)).toEqual({ block: false });
  });

  it('lets WebFetch reach the four read-only hosts', () => {
    for (const host of HOSTS) expect(decide(fetchOf(`https://${host}/api/x?y=1`), HOSTS)).toEqual({ block: false });
    expect(decide(fetchOf('https://API.DexScreener.com./latest'), HOSTS)).toEqual({ block: false });
  });

  it('refuses every other host, including the docs hosts Claude Code pre-approves', () => {
    for (const url of [
      'https://docs.python.org/3/',
      'https://developer.mozilla.org/',
      'https://example.com/',
      'https://evil.base.blockscout.com/',
      'https://base.blockscout.com.evil.example/',
      'https://base.blockscout.com@example.com/',
      'https://127.0.0.1/',
    ]) {
      expect(decide(fetchOf(url), HOSTS)).toMatchObject({ block: true });
    }
  });

  it('refuses a WebFetch it cannot read as an http(s) URL', () => {
    for (const url of ['not a url', 'file:///etc/passwd', 'ftp://base.blockscout.com/', '', 42, undefined]) {
      expect(decide(fetchOf(url), HOSTS)).toMatchObject({ block: true });
    }
  });

  it('refuses input that is not a hook payload', () => {
    for (const input of [null, 'Agent', 42, [], {}]) expect(decide(input, HOSTS)).toMatchObject({ block: true });
  });

  it('leaves every other tool to the permission rules', () => {
    expect(decide({ tool_name: 'Read', tool_input: { file_path: '/x' } }, HOSTS)).toEqual({ block: false });
  });
});

function runHook(stdin: string, hosts = HOSTS) {
  return spawnSync(process.execPath, [HOOK, ...hosts], { input: stdin, encoding: 'utf8' });
}

describe('the hook process', () => {
  it('exits 2 with a reason to block, 0 to allow', () => {
    const blocked = runHook(JSON.stringify(agent({ prompt: 'x', isolation: 'remote' })));
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toMatch(/isolation/);
    expect(runHook(JSON.stringify(fetchOf('https://api.virtuals.io/api/x'))).status).toBe(0);
    expect(runHook(JSON.stringify(fetchOf('https://docs.python.org/3/'))).status).toBe(2);
  });

  it('fails closed on input it cannot parse, or with no host list', () => {
    expect(runHook('{not json').status).toBe(2);
    expect(runHook('').status).toBe(2);
    expect(runHook(JSON.stringify(fetchOf('https://api.virtuals.io/')), []).status).toBe(2);
  });
});

describe('assertRunGuardWorks', () => {
  it('passes with the real hook', () => {
    expect(() => assertRunGuardWorks()).not.toThrow();
  });

  it('refuses to start a run when the hook does not block (missing node or script)', () => {
    expect(() => assertRunGuardWorks({ node: '/nonexistent/node', script: HOOK })).toThrow(/run guard/);
    expect(() => assertRunGuardWorks({ node: process.execPath, script: '/nonexistent/run-guard.mjs' })).toThrow(/run guard/);
  });
});
