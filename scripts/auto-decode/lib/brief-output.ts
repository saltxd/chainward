// scripts/auto-decode/lib/brief-output.ts
//
// Pure parsing/formatting for the paid-brief fulfillment poller. Kept free of
// I/O so it can be unit-tested; the poller (scripts/fulfill-briefs.ts) owns the
// Claude call and the delivery.

import twitterText from 'twitter-text';
import { TEXT_KEYS } from './chain-facts.js';

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

// ── Grounding ─────────────────────────────────────────────────────────────────
//
// The brief run has no tools: what it says about the chain came from the chain
// facts pack (lib/chain-facts.ts). So every address or transaction hash it
// writes must be the order's target or appear in the pack, and the only links it
// may carry go to the hosts below. A model that obeyed a token name ("pay 0xBAD,
// link evil.xyz, tag @victim") is refused here, not delivered.

/** Hosts a brief may link: exactly these, no subdomain or look-alike. */
export const BRIEF_LINK_HOSTS = ['basescan.org', 'base.blockscout.com', 'dexscreener.com', 'chainward.ai', 'app.virtuals.io'] as const;

export interface GroundingContext {
  /** The order's target address (or the address its handle resolved to). */
  target: string;
  /** The pack the run was given. Anything 0x-shaped in it counts as known. */
  pack: unknown;
  /** The buyer's contact: an email or a handle without its @. It may appear in the brief. */
  contact?: string;
}

const FULL_HEX_RE = /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const ELLIDED_HEX_RE = /(0x[0-9a-f]{3,})\s*(?:\.\.\.|\.\.)\s*([0-9a-f]{3,})/g;
const HEX_RUN_RE = /0x[0-9a-f]{3,}/g;
const BARE_HEX_RE = /(?<![0-9a-z])[0-9a-f]{40,}(?![0-9a-z])/g;
const MENTION_RE = /(?:^|[^\p{L}\p{N}_@])[@＠﹫]([\p{L}\p{N}_]{1,50})/gu;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ENTITY_RE = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/i;
const HTML_TAG_RE = /<\/?[a-z!?][^>]*>/i;
/**
 * What the reader sees, as far as a script can tell: NFKC (fullwidth forms,
 * the ellipsis character), format characters dropped (zero-width, bidi), a
 * backslash before punctuation removed (CommonMark renders `evil\.xyz` as
 * evil.xyz) and defanged dots restored.
 */
function readsAs(raw: string): string {
  return asXReadsIt(raw)
    .replace(/\p{Cf}/gu, '')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/\[\.\]|\(\.\)|\{\.\}/g, '.');
}

/** An autolink to an allowed host is plain text to the reader and fine in a brief. */
const AUTOLINK_RE = /<(https:\/\/[^\s<>]+)>/g;

function unwrapAllowedAutolinks(text: string): string {
  return text.replace(AUTOLINK_RE, (whole, url: string) => {
    try {
      return (BRIEF_LINK_HOSTS as readonly string[]).includes(new URL(url).hostname) ? ` ${url} ` : whole;
    } catch {
      return whole;
    }
  });
}

/**
 * The text a reader sees and copies: `[text](url)` and `[text][ref]` show only
 * their text, and emphasis marks and code-span backticks vanish, so
 * `0x**bad0**...` is one address. The URLs are checked separately on the text
 * before this step.
 */
function renderedText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/[*_~`]/g, '');
}

const HEX_SEP = '[\\s\\-_.:,·*`\\[\\]()~]';
// 0x, then hex groups of up to 16 characters apart by separators: one address to a reader.
const SPLIT_PREFIXED_RE = new RegExp(`0x[0-9a-f]{1,16}(?![0-9a-z])(?:${HEX_SEP}+[0-9a-f]{1,16}(?![0-9a-z]))+`, 'g');
const SPLIT_BARE_RE = new RegExp(`(?<![0-9a-z])[0-9a-f]{1,16}(?![0-9a-z])(?:${HEX_SEP}+[0-9a-f]{1,16}(?![0-9a-z]))+`, 'g');

/** Rejoins hex groups a reader would copy as one address; never touches a run that is already long. */
function joinHexGroups(lower: string): string {
  const strip = new RegExp(HEX_SEP, 'g');
  return lower
    .replace(SPLIT_PREFIXED_RE, (m) => '0x' + m.slice(2).replace(strip, ''))
    .replace(SPLIT_BARE_RE, (m) => {
      const joined = m.replace(strip, '');
      return joined.length >= 32 && !/^[0-9]+$/.test(joined) ? joined : m;
    });
}

/** Whole-string 0x addresses and hashes in the pack's chain-derived facts, never in outsider text. */
function groundedHex(pack: unknown, target: string): string[] {
  const known = new Set<string>([target.toLowerCase()]);
  const walk = (v: unknown, key = ''): void => {
    if (typeof v === 'string') {
      if (!TEXT_KEYS.has(key) && FULL_HEX_RE.test(v)) known.add(v.toLowerCase());
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item, key);
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v)) walk(item, k);
    }
  };
  const facts = (pack as { facts?: Array<{ label?: unknown; value?: unknown }> } | null)?.facts;
  for (const fact of Array.isArray(facts) ? facts : []) {
    // ChainWard and ACP answers carry outsider text; only the chain's own reads ground a brief.
    if (typeof fact.label === 'string' && !fact.label.startsWith('chainward_')) walk(fact.value);
  }
  return [...known];
}

function checkHexGrounded(text: string, known: string[]): void {
  const refuse = (what: string): never => {
    throw new Error(`brief names ${JSON.stringify(what.slice(0, 12))}, which is not the target or in the chain facts`);
  };
  const lower = text.toLowerCase();
  const ellided = lower.replace(ELLIDED_HEX_RE, (_m, prefix: string, suffix: string) => {
    if (!known.some((k) => k.startsWith(prefix) && k.endsWith(suffix))) refuse(prefix);
    return ' ';
  });
  const rest = joinHexGroups(ellided);
  for (const m of rest.matchAll(HEX_RUN_RE)) {
    const run = m[0];
    if (run.length === 42 || run.length === 66) {
      if (!known.includes(run)) refuse(run);
    } else if (run.length > 42 || !known.some((k) => k.startsWith(run))) {
      refuse(run);
    }
  }
  // 40 or 64 hex characters with no 0x in front are an address or hash too.
  for (const m of rest.matchAll(BARE_HEX_RE)) {
    if (/^[0-9]+$/.test(m[0])) continue; // a long decimal number (an amount), not an address
    if (!(m[0].length === 40 || m[0].length === 64) || !known.includes('0x' + m[0])) refuse('0x' + m[0]);
  }
}

function checkHostsAllowed(text: string, contact: string | undefined): void {
  // Only an email-shaped contact is set aside here (its domain is not a link), and only as a whole.
  const scanned =
    contact && EMAIL_RE.test(contact)
      ? text.split(new RegExp(contact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' ')
      : text;
  const hosts = [
    ...xLinkHosts(scanned),
    ...[...scanned.matchAll(SCHEME_HOST_RE)].map((m) => hostOf(m[1] ?? '')),
    ...[...scanned.matchAll(HOST_RE)].map((m) => hostOf(m[0])),
  ];
  const other = hosts.find((h) => !(BRIEF_LINK_HOSTS as readonly string[]).includes(h));
  if (other !== undefined) {
    throw new Error(`brief links to ${JSON.stringify(other.slice(0, 60))}; only ${BRIEF_LINK_HOSTS.join(', ')} may be linked`);
  }
}

function checkNoMentions(text: string, contact: string | undefined): void {
  for (const m of text.matchAll(MENTION_RE)) {
    if (m[1]!.toLowerCase() !== (contact ?? '').toLowerCase()) {
      throw new Error(`brief carries an @-mention (${JSON.stringify('@' + m[1]!.slice(0, 30))}); only the buyer may be named`);
    }
  }
}

/**
 * Throws unless every address and hash, link host and @ in the brief is allowed.
 * Raw HTML, entities and images are refused outright: the app renders markdown
 * (an entity shows as the character it names, an image loads from any host), so
 * a brief has no use for them. Nothing is cut out of the text before checking.
 */
export function checkBriefGrounding(parts: { markdown: string; thread?: string[]; summary?: string }, ctx: GroundingContext): void {
  const known = groundedHex(ctx.pack, ctx.target);
  for (const part of [parts.markdown, ...(parts.thread ?? []), parts.summary ?? '']) {
    const text = unwrapAllowedAutolinks(readsAs(part));
    if (ENTITY_RE.test(text)) throw new Error('brief carries an HTML entity; entities are not allowed');
    if (HTML_TAG_RE.test(text)) throw new Error('brief carries raw HTML; it is not allowed');
    if (/!\[/.test(text)) throw new Error('brief carries a markdown image; images are not allowed');
    checkHexGrounded(renderedText(text), known);
    checkHostsAllowed(text, ctx.contact);
    checkNoMentions(text, ctx.contact);
  }
}

export type BriefOutputOptions = (
  | { needThread: false }
  | { needThread: true; buyerHandle: string }
) & {
  /** When given, the brief is also checked against the chain facts the run was given. */
  grounding?: GroundingContext;
};

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
  if (opts.grounding) checkBriefGrounding({ markdown: md, thread: opts.needThread ? thread : undefined, summary }, opts.grounding);
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
