// scripts/auto-decode/lib/brief-output.ts
//
// Pure parsing/formatting for the paid-brief fulfillment poller. Kept free of
// I/O so it can be unit-tested; the poller (scripts/fulfill-briefs.ts) owns the
// Claude call and the delivery.

export interface BriefOutput {
  /** The written brief — always required. */
  markdown: string;
  /** 2–4 tweets ≤280 chars — present only when the model emitted a valid thread. */
  thread?: string[];
  /** One-line ops summary; empty string when absent. */
  summary: string;
}

const MAX_TWEET = 280;

function lastBlock(stdout: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  return [...stdout.matchAll(re)].pop()?.[1];
}

function asThread(raw: string | undefined): string[] | undefined {
  if (raw == null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return undefined;
  }
  const ok =
    Array.isArray(parsed) &&
    parsed.length >= 2 &&
    parsed.length <= 4 &&
    parsed.every((t) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TWEET);
  return ok ? (parsed as string[]) : undefined;
}

/**
 * Extract the brief from Claude's stdout. The markdown brief is mandatory for
 * every order; the thread is mandatory only when the order is delivered
 * publicly on X (`needThread`). The last occurrence of each block wins, so a
 * model that drafts twice delivers its final version.
 */
export function parseBriefOutput(stdout: string, opts: { needThread: boolean }): BriefOutput {
  const md = lastBlock(stdout, 'BRIEF_MARKDOWN')?.trim();
  if (!md) throw new Error('no <BRIEF_MARKDOWN> block in claude output');

  const threadRaw = lastBlock(stdout, 'BRIEF_THREAD');
  const thread = asThread(threadRaw);
  if (opts.needThread) {
    if (threadRaw == null) throw new Error('no <BRIEF_THREAD> block in claude output');
    if (!thread) {
      throw new Error(`BRIEF_THREAD invalid shape (got ${threadRaw.trim().slice(0, 120)})`);
    }
  }

  const summary = lastBlock(stdout, 'BRIEF_SUMMARY')?.trim() ?? '';
  return { markdown: md, thread, summary };
}

function hardSplit(s: string, limit: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += limit) out.push(s.slice(i, i + limit));
  return out;
}

/**
 * Split markdown into Discord-sized messages (default 1900 < the 2000 cap),
 * preferring paragraph boundaries and hard-splitting only a paragraph that is
 * itself over the limit.
 */
export function chunkForDiscord(text: string, limit = 1900): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let cur = '';
  for (const para of trimmed.split(/\n\n+/)) {
    const pieces = para.length > limit ? hardSplit(para, limit) : [para];
    for (const piece of pieces) {
      if (!cur) {
        cur = piece;
      } else if (cur.length + 2 + piece.length <= limit) {
        cur += `\n\n${piece}`;
      } else {
        chunks.push(cur);
        cur = piece;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
