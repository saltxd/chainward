import { createHash } from 'node:crypto';
import { isPlaceholderAddress } from '@chainward/common';
import type { HireAgentInput, HireReport } from '@chainward/decode';

// ─── What a TermiX buyer sends us, and what we send back ──────────────────────
//
// Input: an ERC-8004 agent id or an owner's 0x address on BNB Chain, read only
// from text the buyer wrote (never the listing copy, whose example id would
// otherwise read as a target). Output: the hire report exactly as the x402
// check returns it (method and limits included), a markdown summary, and a
// one-paragraph summary for the delivery note. Never a safety verdict.

export type TargetParse =
  | { ok: true; target: HireAgentInput }
  | { ok: false; reason: 'none' | 'ambiguous' | 'placeholder'; message: string };

const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const ID_PATTERNS = [
  /\b(?:agent|token)(?:\s*id)?\s*[:#=]?\s*#?(\d{1,12})\b/gi,
  /\bid\s*[:#=]?\s*(\d{1,12})\b/gi,
  /(?:^|[^\w&])#(\d{1,12})\b/g,
  /\/agents?\/(\d{1,12})\b/gi,
];
const BARE_ID_RE = /^\s*#?\s*(\d{1,12})\s*$/;

export const ASK_FOR_INPUT_MESSAGE =
  'Thanks for the order. To run the hire check, reply with the ERC-8004 agent id on BNB Chain (for example 361259) ' +
  "or the owner's 0x address. I accept the order only once I can run the check, so nothing is charged until then.";

const AMBIGUOUS_MESSAGE =
  'I found more than one agent id or address in your messages. Reply with the one you want checked: ' +
  "a single ERC-8004 agent id on BNB Chain or the owner's 0x address.";

const PLACEHOLDER_MESSAGE =
  "That is a placeholder address (0x000...), not a wallet. Reply with an ERC-8004 agent id on BNB Chain or the owner's 0x address.";

/** One target from the buyer's own text, or why there isn't exactly one. */
export function parseHireTarget(texts: string[]): TargetParse {
  const ids = new Set<number>();
  const addresses = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(ADDRESS_RE)) addresses.add(m[0].toLowerCase());
    const bare = BARE_ID_RE.exec(text);
    if (bare) ids.add(Number(bare[1]));
    for (const re of ID_PATTERNS) for (const m of text.matchAll(re)) ids.add(Number(m[1]));
  }
  if (ids.size + addresses.size > 1) return { ok: false, reason: 'ambiguous', message: AMBIGUOUS_MESSAGE };
  const [id] = ids;
  if (id !== undefined) return { ok: true, target: { kind: 'id', id } };
  const [address] = addresses;
  if (address === undefined) return { ok: false, reason: 'none', message: ASK_FOR_INPUT_MESSAGE };
  if (isPlaceholderAddress(address)) return { ok: false, reason: 'placeholder', message: PLACEHOLDER_MESSAGE };
  return { ok: true, target: { kind: 'owner', address } };
}

const n = (v: number) => v.toLocaleString('en-US');
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

function subject(r: HireReport): string {
  if (r.agent_id !== null) return `agent ${r.agent_id} on BNB Chain (owner ${r.owner})`;
  if (r.agent_ids.length === 0) return `${r.owner} on BNB Chain (no ERC-8004 agents found for this owner)`;
  const list = r.agent_ids.length === 2 ? r.agent_ids.join(' and ') : r.agent_ids.join(', ');
  return `agents ${list} owned by ${r.owner} on BNB Chain`;
}

const CLOSING = 'No link found is not proven independence. This describes where money moved, not who controls a wallet. Not a safety verdict.';

/** The one-paragraph summary: counts, the 3-independent bar as the check measures it, and the limits. */
export function hireSummary(r: HireReport): string {
  const window = `${r.window_days} days to block ${n(r.as_of.block)} (${utc(r.as_of.time)})`;
  const head = `ChainWard hire check for ${subject(r)}, ${window}:`;
  if (r.hires.total === 0) {
    return `${head} No hires found on the TermiX escrow or the shared ERC-8183 contract, so the agent does not meet the 3-independent-hirer bar. ${CLOSING}`;
  }
  const s = r.summary;
  const bar = s.passes_three_independent
    ? 'so the agent meets the 3-independent-hirer bar as this check measures it'
    : 'so the agent does not meet the 3-independent-hirer bar as this check measures it';
  return (
    `${head} ${plural(r.hires.total, 'hire', 'hires')} from ${plural(r.hires.distinct_hirers, 'distinct wallet', 'distinct wallets')}. ` +
    `Of those wallets, ${n(s.owner_linked)} linked to the owner, ${n(s.inconclusive)} inconclusive and ` +
    `${n(s.independent_within_limits)} with no link found within the check's limits, ${bar}. ${CLOSING}`
  );
}

export interface DeliverableFile {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
}

export interface HireDeliverable {
  files: DeliverableFile[];
  /** Becomes the order's public deliveryNote. */
  note: string;
  /** Posted to the order's conversation. */
  message: string;
}

const DISCLAIMER = 'Describes where money moved on BNB Chain, not who controls a wallet or why. No link found is not proven independence. Not a safety verdict.';

function file(fileName: string, contentType: string, text: string): DeliverableFile {
  const bytes = new TextEncoder().encode(text);
  return { fileName, contentType, bytes, sha256: `0x${createHash('sha256').update(bytes).digest('hex')}`, sizeBytes: bytes.length };
}

const targetParam = (t: HireAgentInput) => (t.kind === 'id' ? String(t.id) : t.address);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function markdown(r: HireReport, summary: string): string {
  const s = r.summary;
  const lines = [
    `# ChainWard hire check: ${subject(r)}`,
    '',
    summary,
    '',
    '## Result',
    '',
    `- Hires: ${n(r.hires.total)} from ${n(r.hires.distinct_hirers)} distinct wallets (TermiX escrow ${n(r.hires.by_source.termix_escrow)}, ERC-8183 ${n(r.hires.by_source.erc8183_shared)})`,
    `- Linked to the owner: ${n(s.owner_linked)}`,
    `- Inconclusive: ${n(s.inconclusive)}`,
    `- No link found within limits: ${n(s.independent_within_limits)}`,
    `- passes_three_independent: ${String(s.passes_three_independent)}`,
    `- As of block ${n(r.as_of.block)} (${r.as_of.time})`,
    '',
  ];
  if (r.hirers.length > 0) {
    lines.push('## Hirers', '', '| Hirer | Hires | First hire | Verdict | Evidence |', '|---|---:|---|---|---|');
    for (const h of r.hirers) lines.push(`| ${h.address} | ${n(h.hires)} | ${h.first_hire_at} | ${h.verdict} | ${cell(h.evidence)} |`);
    lines.push('');
  }
  lines.push('## Method', '', r.method, '', '## Limits', '', ...r.limits.map((l) => `- ${l}`), '');
  return lines.join('\n');
}

export function buildHireDeliverable(input: { orderId: string; target: HireAgentInput; report: HireReport }): HireDeliverable {
  const { orderId, target, report } = input;
  const summary = hireSummary(report);
  const slug = targetParam(target);
  const json = {
    product: 'ChainWard Set and Earn hire check',
    order_id: orderId,
    input: target.kind === 'id' ? { agent: target.id } : { owner: target.address },
    source: `https://api.chainward.ai/api/risk/hires?agent=${slug}&chain=bsc`,
    summary,
    report,
    disclaimer: DISCLAIMER,
  };
  return {
    files: [
      file(`chainward-hire-check-${slug}.json`, 'application/json', `${JSON.stringify(json, null, 2)}\n`),
      file(`chainward-hire-check-${slug}-summary.md`, 'text/markdown', markdown(report, summary)),
    ],
    note: summary,
    message: `${summary}\n\nThe full JSON report and a markdown summary are attached to the delivery.`,
  };
}
