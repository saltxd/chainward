import { describe, it, expect } from 'vitest';
import { CLAUDE_PRINT_ARGS } from '../src/report-writer.js';

// The report prompt carries text outsiders write (agent names, token symbols),
// and the decoder pod holds its signer key. The report is pure text-in,
// text-out, so the CLI runs with no tools, no MCP servers and no settings files.
describe('CLAUDE_PRINT_ARGS: the spawned `claude` runs with nothing to act with', () => {
  const args: string[] = [...CLAUDE_PRINT_ARGS];
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };

  it('is print mode', () => {
    expect(args[0]).toBe('--print');
  });

  it('turns off every built-in tool', () => {
    expect(valueOf('--tools')).toBe('');
  });

  it('refuses anything not allow-listed instead of asking', () => {
    expect(valueOf('--permission-mode')).toBe('dontAsk');
  });

  it('loads no MCP server and no project or local settings', () => {
    expect(args).toContain('--strict-mcp-config');
    expect(args).not.toContain('--mcp-config');
    expect(valueOf('--setting-sources')).toBe('user');
  });

  it('never skips permissions', () => {
    expect(args.join(' ')).not.toMatch(/dangerously|bypassPermissions/);
  });
});
