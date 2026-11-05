// scripts/auto-decode/lib/brief-output.ts
//
// Pure parsing/formatting for the paid-brief fulfillment poller. Kept free of
// I/O so it can be unit-tested; the poller (scripts/fulfill-briefs.ts) owns the
// Claude call and the delivery.

import twitterText from 'twitter-text';

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

// Links are found two ways, and a thread fails if either finds a host other than
// chainward.ai:
//
// 1. X's own parser, twitter-text (pinned), which also links bare domains with no
//    scheme, punycode TLDs included (`wallet.xn--80aswg/claim`, re-review R3).
// 2. A wider net for what its TLD list (2020) does not know yet: any run of
//    dotted labels that ends in a letters-only or punycode (`xn--`) top-level
//    label. Numbers such as 1.2M or 4.5k, and short addresses such as
//    0x1234...cdef, are not hosts.
const HOST_RE =
  /(?:[\p{L}\p{N}\p{M}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?\.)+(?:xn--[a-z0-9-]+|\p{L}[\p{L}\p{M}]{1,62})(?![\p{L}\p{N}\p{M}-])/giu;
const SCHEME_HOST_RE = /[a-z][a-z0-9+.-]*:\/\/([^\s/?#]*)/gi;
/** Exactly this host, no subdomain or look-alike. */
const LINKABLE_HOST = 'chainward.ai';
const IDEOGRAPHIC_FULL_STOP = String.fromCharCode(0x3002);

/**
 * What X would see: NFKC folds the fullwidth and small at-signs (U+FF20, U+FE6B)
 * into `@` and fullwidth letters and dots into ASCII; the ideographic full stop
 * (which NFKC leaves) is read as a dot too.
 */
function asXReadsIt(tweet: string): string {
  return tweet.normalize('NFKC').split(IDEOGRAPHIC_FULL_STOP).join('.');
}

function hostOf(raw: string): string {
  return raw.toLowerCase().replace(/^[^@]*@/, '').replace(/:\d*$/, '').replace(/\.$/, '');
}

/** The host of a link as X extracted it (no scheme means https), IDN as punycode. */
function urlHost(link: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`;
  try {
    return new URL(withScheme).hostname.replace(/\.$/, '');
  } catch {
    return link.toLowerCase(); // unreadable: never equal to chainward.ai
  }
}

/** Every host X itself would link in this text, by its own parser. */
export function xLinkHosts(text: string): string[] {
  return twitterText.extractUrlsWithIndices(text, { extractUrlsWithoutProtocol: true }).map((e) => urlHost(e.url));
}

/**
 * A public thread posts from @chainwardai with no human review. It must open by
 * tagging the buyer, and that tag is the only at-sign it may carry: X treats
 * `.@x` and the fullwidth at-sign (U+FF20) as mentions too, so every other @ in
 * any form is refused, emails included. The only link or domain name it may
 * carry is chainward.ai, exactly.
 */
function checkThreadSafety(thread: string[], buyerHandle: string): void {
  const seen = thread.map(asXReadsIt);
  const opening = /^@([A-Za-z0-9_]+)/.exec(seen[0] ?? '')?.[1];
  if (opening?.toLowerCase() !== buyerHandle.toLowerCase()) {
    throw new Error('BRIEF_THREAD does not open by tagging the buyer');
  }
  const atSigns = seen.join('\n').split('@').length - 1;
  if (atSigns !== 1) throw new Error('BRIEF_THREAD has an @ other than the opening buyer tag');
  thread.forEach((raw, i) => {
    const tweet = seen[i] ?? '';
    const hosts = [
      ...xLinkHosts(raw),
      ...xLinkHosts(tweet),
      ...[...tweet.matchAll(SCHEME_HOST_RE)].map((m) => hostOf(m[1] ?? '')),
      ...[...tweet.matchAll(HOST_RE)].map((m) => hostOf(m[0])),
    ];
    const other = hosts.find((h) => h !== LINKABLE_HOST);
    if (other !== undefined) {
      throw new Error(`BRIEF_THREAD links to ${JSON.stringify(other.slice(0, 60))}; only chainward.ai may appear`);
    }
  });
}

export type BriefOutputOptions = { needThread: false } | { needThread: true; buyerHandle: string };

/**
 * Extract the brief from Claude's stdout. The markdown brief is mandatory for
 * every order; the thread is mandatory only when the order is delivered
 * publicly on X (`needThread`), and then it must tag the buyer and no one else.
 * The last occurrence of each block wins, so a model that drafts twice delivers
 * its final version.
 */
export function parseBriefOutput(stdout: string, opts: BriefOutputOptions): BriefOutput {
  const md = lastBlock(stdout, 'BRIEF_MARKDOWN')?.trim();
  if (!md) throw new Error('no <BRIEF_MARKDOWN> block in claude output');

  const threadRaw = lastBlock(stdout, 'BRIEF_THREAD');
  const thread = asThread(threadRaw);
  if (opts.needThread) {
    if (threadRaw == null) throw new Error('no <BRIEF_THREAD> block in claude output');
    if (!thread) {
      throw new Error(`BRIEF_THREAD invalid shape (got ${threadRaw.trim().slice(0, 120)})`);
    }
    checkThreadSafety(thread, opts.buyerHandle);
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
