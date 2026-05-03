import { spawn } from 'node:child_process';
import { renderFallbackReport } from './templates/report-fallback.md.js';
import type { QuickDecodeResultData, ReportSource } from './types.js';

export const PROMPT_VERSION = '1.0.0';

const PROMPT_SCAFFOLD = `You are a wallet decoder for ChainWard, an intelligence platform for the AI agent
economy on Base. You are writing a markdown report from VERIFIED on-chain data
about an AI agent's wallet.

Voice constraints:
- Authoritative, terse, evidence-first. Every claim must be backed by the data block.
- Never use accusatory language ("dirty", "scam", "fake", "broken"). Use neutral
  descriptive framing.
- Lead with chain reality (active_today / active_7d / active_30d).
- Then claim discrepancies (what the Virtuals dashboard says vs. what the chain says).
- Then context (peer cohort, cluster status if applicable).
- Highlight the failure mode if dormant: "operator silence, not exploit."
- 3 to 5 paragraphs. No more, no less.
- Open with a single H1: "# {name} (ACP #{id}) — {classification}".
- Markdown only. No emoji. No tables in the prose body. No bullet lists in body.

Forbidden:
- Numeric "survival scores". The schema deliberately omits them; the report must too.
- Any phrase starting "It seems", "It appears", "Likely". Be definite or omit.
- Speculation about operator intent or token holder behavior beyond what the data shows.

Data you have:
{data}

Output format: pure markdown. No prefix, no suffix, no explanation. Begin with the H1.`;

export interface WriteReportOptions {
  replayMode?: boolean;
  timeoutMs?: number;
}

export interface WriteReportResult {
  markdown: string;
  source: ReportSource;
}

/**
 * Renders the markdown report. Returns both the text and a source flag so
 * the caller can record in meta whether claude actually answered or we fell
 * back to the template — buyers and operators can tell which they got.
 */
export async function writeReport(
  data: QuickDecodeResultData,
  options: WriteReportOptions = {},
): Promise<WriteReportResult> {
  if (options.replayMode) {
    return { markdown: renderFallbackReport(data), source: 'fallback' };
  }

  const prompt = PROMPT_SCAFFOLD.replace('{data}', JSON.stringify(data, null, 2));
  const timeoutMs = options.timeoutMs ?? 60_000;

  try {
    const md = await runClaudePrint(prompt, timeoutMs);
    if (!md || !md.trim().startsWith('# ')) {
      // violates H1 constraint or empty — fallback
      return { markdown: renderFallbackReport(data), source: 'fallback' };
    }
    return { markdown: md.trim() + '\n', source: 'claude' };
  } catch {
    return { markdown: renderFallbackReport(data), source: 'fallback' };
  }
}

async function runClaudePrint(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Pass only the env the CLI needs. The pod has the signer private key, DB
    // password, Privy creds, etc. in process.env — we don't want any of those
    // leaking into a subprocess that could be tricked into echoing them via
    // a hostile prompt.
    const restrictedEnv: NodeJS.ProcessEnv = {
      HOME: process.env.HOME ?? '/root',
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    };
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      restrictedEnv.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    const child = spawn('claude', ['--print'], {
      env: restrictedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('claude --print timed out'));
    }, timeoutMs);

    child.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    child.on('exit', (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
