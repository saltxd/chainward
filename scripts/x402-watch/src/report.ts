/**
 * Plain-text reports, ready to paste into an email by hand: the free first check, and
 * the daily change report. Each finding reads like the sample alert on
 * chainward.ai/x402/watch: when we asked, what came back, what the buyer did, what it
 * did the time before, and the field to fix. No em dashes, and no verdict words
 * beyond what the buyer did.
 */
import { STATUS_CODES } from 'node:http';
import { DEFAULT_ASSETS, findDefaultAsset } from '@x402/evm';
import { isObject, type Offer } from './challenge.js';
import { verdictOf, type EndpointCheck, type Outcome, type Unit } from './classify.js';
import type { UnitState, WatchEvent } from './diff.js';
import { V1_EVM, V1_SOLANA, chainLabel, chainName, evmCaip2 } from './networks.js';
import type { ProbeRecord } from './probe.js';
import { factsFor, onchainDomain, type TokenBook } from './tokens.js';

export const STOCK_BUYER = '@x402/fetch and @x402/evm 2.27.0, default settings';
const WATCH_PAGE = 'chainward.ai/x402/watch';

/** The class names on the watch page, for "Yesterday it failed: ...". */
export const OUTCOME_NAME: Record<Outcome, string> = {
  SIGNS_VALID_AUTHORIZATION: 'signs a valid payment',
  SIGNS_DOMAIN_UNVERIFIED: "signs a payment (the token's signing domain could not be read on-chain)",
  FAIL_NO_X402_CHALLENGE: 'no x402 challenge',
  FAIL_V2_BODY_ONLY_NO_HEADER: 'v2 challenge without the PAYMENT-REQUIRED header',
  FAIL_V1_NETWORK_NAMES_IN_V2: 'v1 network names in a v2 challenge',
  FAIL_ASSET_NOT_A_CONTRACT: 'asset is not a contract',
  FAIL_WRONG_EIP712_DOMAIN: 'wrong EIP-712 domain in extra.name or extra.version',
  FAIL_TOKEN_HAS_NO_EIP3009: 'token has no EIP-3009 and the offer does not use permit2',
  FAIL_OTHER: 'the stock client stopped with an error',
  OVER_AUTHORIZE_VALIDITY_OVER_1_DAY: 'a payment valid for more than a day',
  OUT_OF_SCOPE_NO_EVM_EXACT_OFFER: 'no EVM exact offer (reported, not judged)',
  OUT_OF_SCOPE_NON_DEFAULT_TOKEN_ONLY: "only tokens outside the stock client's default list (reported, not judged)",
  POLICY_OVER_1_USD_DEFAULT_CAP: "a price above the stock client's $1 cap (reported, not judged)",
  TESTNET_ONLY_OFFER_SELECTED: 'only a testnet offer (reported, not judged)',
  NO_402_RESPONSE: 'no 402',
  NETWORK_ERROR: 'no answer',
};

export const hhmm = (iso: string) => iso.slice(11, 16);
export const day = (iso: string) => iso.slice(0, 10);
const q = (v: unknown) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v ?? null));
export const shortAddr = (a: string) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** "Oct 21" */
export function monthDay(iso: string): string {
  const d = new Date(`${day(iso)}T00:00:00Z`);
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
}

function tokenOf(o: Offer, tokens: TokenBook): { symbol: string | null; decimals: number | null } {
  const caip = evmCaip2(o.network);
  if (!caip || typeof o.asset !== 'string') return { symbol: null, decimals: null };
  const facts = factsFor(tokens, caip, o.asset);
  let def: { symbol: string; decimals: number } | undefined;
  try {
    def = findDefaultAsset(o.asset, caip as `${string}:${string}`) as { symbol: string; decimals: number } | undefined;
  } catch {
    def = undefined;
  }
  return { symbol: facts?.symbol ?? def?.symbol ?? null, decimals: facts?.decimals ?? def?.decimals ?? null };
}

/** "0.01 USDC", or the atomic amount when the token's decimals are unknown. */
export function price(o: Offer, tokens: TokenBook): string {
  const raw = o.amount ?? o.maxAmountRequired;
  const { symbol, decimals } = tokenOf(o, tokens);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || decimals === null) return `${String(raw)} (atomic units)`;
  const n = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} ${symbol ?? 'tokens'}`;
}

/** "USDC on World Chain (eip155:480)" */
export function offerLabel(o: Offer, tokens: TokenBook): string {
  const { symbol } = tokenOf(o, tokens);
  const ex = isObject(o.extra) ? o.extra : {};
  const tok = symbol ?? (typeof ex.name === 'string' ? ex.name : shortAddr(String(o.asset)));
  return `${tok} on ${chainLabel(o.network)}`;
}

function offerLine(i: number, o: Offer, tokens: TokenBook): string {
  const ex = isObject(o.extra) ? o.extra : null;
  const parts = [
    `${String(o.scheme)} on ${q(o.network)}`,
    price(o, tokens),
    `asset ${String(o.asset)}`,
    `payTo ${String(o.payTo)}`,
    `maxTimeoutSeconds ${JSON.stringify(o.maxTimeoutSeconds ?? null)}`,
  ];
  if (ex) parts.push(`extra ${JSON.stringify(ex)}`);
  return `accepts[${i}]: ${parts.join(', ')}`;
}

function offerFields(i: number, o: Offer): string[] {
  const keys = ['scheme', 'network', 'amount', 'maxAmountRequired', 'asset', 'payTo', 'maxTimeoutSeconds', 'extra'];
  return keys.filter((k) => k in o).map((k) => `accepts[${i}].${k}: ${JSON.stringify(o[k])}`);
}

export function requestBlock(rec: ProbeRecord): string[] {
  const lines = [`${rec.method} ${rec.url}`, ...Object.entries(rec.request.headers).map(([k, v]) => `${k}: ${v}`)];
  if (rec.request.body !== undefined) lines.push('', rec.request.body);
  return lines;
}

const SHOWN_HEADERS = ['location', 'server', 'x-vercel-error', 'www-authenticate'];

/**
 * What came back. With `focus`, those offers field by field (a change report); with
 * null and a token book, every offer on one line (the first check).
 */
export function responseBlock(rec: ProbeRecord, check: EndpointCheck, focus: number[] | null, compact?: TokenBook): string[] {
  if (rec.status === null) return [`no response: ${rec.error ?? 'unknown error'}`];
  const lines = [`${rec.status} ${STATUS_CODES[rec.status] ?? ''}`.trim()];
  for (const h of SHOWN_HEADERS) {
    const v = rec.headers?.[h];
    if (v !== undefined) lines.push(`${h}: ${v.slice(0, 200)}`);
  }
  if (rec.status !== 402) return lines;
  const fromHeader = rec.headers?.['payment-required'] !== undefined;
  lines.push(fromHeader ? 'PAYMENT-REQUIRED header, decoded:' : 'no PAYMENT-REQUIRED header; JSON body:');
  if (check.offers.length === 0) {
    lines.push(`  ${(rec.bodyText ?? '').slice(0, 300) || '(empty body)'}`);
    return lines;
  }
  lines.push(`  x402Version: ${JSON.stringify(check.version ?? null)}`);
  if (focus === null && compact) {
    check.offers.slice(0, 12).forEach((o, i) => lines.push(`  ${offerLine(i, o, compact)}`));
    if (check.offers.length > 12) lines.push(`  (${check.offers.length - 12} more offers)`);
    return lines;
  }
  const show = focus ?? check.offers.map((_, i) => i);
  for (const i of show.slice(0, 8)) for (const l of offerFields(i, check.offers[i]!)) lines.push(`  ${l}`);
  const rest = check.offers.length - Math.min(show.length, 8);
  if (rest > 0) lines.push(`  (${rest} more offer${rest === 1 ? '' : 's'})`);
  return lines;
}

function legacyFix(offers: Offer[]): string {
  const names = [...new Set(offers.map((o) => o.network).filter((n): n is string => typeof n === 'string' && !n.includes(':')))];
  const ids = names.map((n) => [n, V1_EVM[n] ?? V1_SOLANA[n]] as const).filter((p) => p[1]);
  if (ids.length === 1) return `use the CAIP-2 id '${ids[0]![1]}'.`;
  if (ids.length > 1) return `use the CAIP-2 ids ${ids.map(([n, id]) => `'${id}' for '${n}'`).join(' and ')}.`;
  return "use CAIP-2 network ids, like 'eip155:8453' for Base.";
}

const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function validUntil(seconds: number): string {
  const until = new Date(Date.now() + seconds * 1000);
  return Number.isFinite(until.getTime()) ? `${until.toISOString().slice(0, 10)}` : 'a date past the year 275760';
}

/** What came back and what the buyer did, then the field to fix (null when nothing needs fixing). */
export function explain(check: EndpointCheck, unit: Unit, tokens: TokenBook): { what: string; fix: string | null } {
  const rec = check.probe;
  const o = unit.offerIndex !== null ? check.offers[unit.offerIndex] : undefined;
  const ex = o && isObject(o.extra) ? o.extra : {};
  const caip = o ? evmCaip2(o.network) : null;
  const facts = o && caip ? factsFor(tokens, caip, String(o.asset)) : undefined;
  const label = o ? offerLabel(o, tokens) : 'the offer';
  const offers = unit.kind === 'offer' && o ? [o] : check.offers;
  switch (unit.outcome) {
    case 'SIGNS_VALID_AUTHORIZATION': {
      const secs = unit.replay?.validitySeconds;
      return { what: `The buyer signed a valid payment: ${o ? price(o, tokens) : 'the price'} on ${o ? chainName(o.network) : 'its chain'}${secs ? `, valid for ${secs} seconds` : ''}.`, fix: null };
    }
    case 'SIGNS_DOMAIN_UNVERIFIED':
      return { what: `The buyer signed a payment for ${label}, but we could not read the token's signing domain on-chain today, so we can't confirm the token would accept it.`, fix: null };
    case 'FAIL_V1_NETWORK_NAMES_IN_V2': {
      const names = [...new Set(offers.map((a) => a.network).filter((n): n is string => typeof n === 'string' && !n.includes(':')))].map((n) => `'${n}'`);
      return { what: `The 402 offered only ${andList(names)} under x402Version 2, so the buyer found no network it could match and stopped.`, fix: legacyFix(offers) };
    }
    case 'FAIL_WRONG_EIP712_DOMAIN': {
      const real = onchainDomain(facts);
      const said = `{name '${String(ex.name)}', version '${String(ex.version)}'}`;
      const what =
        real.name !== null && real.version !== null
          ? `The 402 offered ${label} with extra ${said}, but the token's own EIP-712 domain is {name '${real.name}', version '${real.version}'}, so the buyer signed a payment the token will reject.`
          : `The 402 offered ${label} with extra ${said}, which doesn't hash to the token's DOMAIN_SEPARATOR, so the buyer signed a payment the token will reject.`;
      let fix =
        real.name !== null && real.version !== null
          ? `set extra.name to '${real.name}' and extra.version to '${real.version}', the token's own name and version.`
          : `set extra.name and extra.version to the token's eip712Domain() on ${String(o?.asset)}.`;
      if (facts?.eip3009 === false) fix += " This token has no EIP-3009 transferWithAuthorization either: send assetTransferMethod 'permit2', or drop the offer.";
      return { what, fix };
    }
    case 'FAIL_TOKEN_HAS_NO_EIP3009':
      return {
        what: `The 402 offered ${label} for an EIP-3009 transfer (no assetTransferMethod), but the token has no transferWithAuthorization, so the payment the buyer signed can't be executed.`,
        fix: "send assetTransferMethod 'permit2' for this token, or drop the offer.",
      };
    case 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY': {
      const mts = o?.maxTimeoutSeconds;
      const secs = unit.replay?.validitySeconds ?? (typeof mts === 'number' ? mts : 0);
      const stamp = typeof mts === 'number' && mts > 1_000_000_000;
      return {
        what: stamp
          ? `The 402 set maxTimeoutSeconds to ${mts}, which looks like a Unix time, so the buyer signed a payment that stays valid until ${validUntil(secs)}.`
          : `The 402 set maxTimeoutSeconds to ${JSON.stringify(mts ?? null)}, so the buyer signed a payment that stays valid for ${(secs / 86400).toFixed(1)} days, until ${validUntil(secs)}.`,
        fix: stamp
          ? 'maxTimeoutSeconds is a duration in seconds, not a timestamp: use the time a payment may take, for example 300.'
          : 'set maxTimeoutSeconds to the time a payment may take, for example 300.',
      };
    }
    case 'FAIL_ASSET_NOT_A_CONTRACT': {
      const asset = o ? String(o.asset) : unit.detail;
      const where = o ? chainLabel(o.network) : 'its chain';
      const def = caip ? (DEFAULT_ASSETS as unknown as Record<string, readonly { asset: string; symbol: string }[] | undefined>)[caip]?.[0] : undefined;
      return {
        what: `The 402 offered asset ${asset} on ${where}, and there is no contract at that address, so there is nothing to pay with.`,
        fix: `set asset to the token's contract address${def ? ` (${def.symbol} on ${chainName(caip)} is ${def.asset})` : ''}.`,
      };
    }
    case 'FAIL_V2_BODY_ONLY_NO_HEADER':
      return {
        what: 'The 402 put an x402Version 2 challenge in the JSON body only, with no PAYMENT-REQUIRED header, so the buyer could not read it.',
        fix: 'send the challenge in the PAYMENT-REQUIRED header, as base64-encoded JSON; @x402/fetch reads version 2 only from that header.',
      };
    case 'FAIL_NO_X402_CHALLENGE': {
      const hostErr = rec.headers?.['x-vercel-error'];
      return {
        what: `The 402 carried no x402 challenge: no PAYMENT-REQUIRED header and no accepts in the body.${hostErr ? ` The host's own error header says ${hostErr}, so this 402 is the host's, not your service's.` : ''}`,
        fix: hostErr ? 'restore the paused deployment, or point buyers at the host that serves it now.' : 'return the x402 challenge in the PAYMENT-REQUIRED header.',
      };
    }
    case 'FAIL_OTHER':
      return {
        what: `The buyer stopped with this error: ${(unit.replay?.error ?? unit.detail).slice(0, 240)}`,
        fix: firstStrictFinding(check, unit) ?? 'see the error above.',
      };
    case 'OUT_OF_SCOPE_NO_EVM_EXACT_OFFER':
      return { what: `The 402 had no 'exact' offer on an EVM chain (${unit.detail}), which is all a stock EVM buyer pays. Reported, not judged.`, fix: null };
    case 'OUT_OF_SCOPE_NON_DEFAULT_TOKEN_ONLY':
      return { what: "Every offer uses a token outside the stock client's default list, so a buyer with default settings refuses to pay. Reported, not judged.", fix: null };
    case 'POLICY_OVER_1_USD_DEFAULT_CAP':
      return { what: `The price is above the $1 a stock client pays by default${o ? ` (${price(o, tokens)})` : ''}, so a buyer with default settings refuses it. Reported, not judged.`, fix: null };
    case 'TESTNET_ONLY_OFFER_SELECTED':
      return { what: `The only offer the buyer could use is on a testnet (${o ? chainLabel(o.network) : unit.detail}). Reported, not judged.`, fix: null };
    case 'NO_402_RESPONSE': {
      const loc = rec.headers?.location;
      return {
        what: `It answered ${rec.status} ${STATUS_CODES[rec.status ?? 0] ?? ''} instead of 402${loc ? `, pointing to ${loc}, which we don't follow` : ''}, so the buyer never saw a price.`.replace(/\s+,/g, ',').replace(/ {2,}/g, ' '),
        fix: loc ? 'if the route moved, send us the new URL.' : 'if the route needs a sample request or another method to answer 402, send us one.',
      };
    }
    case 'NETWORK_ERROR':
      return { what: `It did not answer (${rec.error ?? 'no response'}).`, fix: null };
  }
}

function firstStrictFinding(check: EndpointCheck, unit: Unit): string | null {
  const f = check.findings.find((x) => x.class !== '-' && (unit.offerIndex === null || x.acceptIndex === undefined || x.acceptIndex === unit.offerIndex));
  return f ? `${f.detail} (lint class ${f.class}, ${f.code}).` : null;
}

function who(check: EndpointCheck, unit: Unit, tokens: TokenBook): string {
  const rec = check.probe;
  if (unit.kind === 'standard') return `At ${hhmm(rec.sentAt)} UTC our standard buyer requested ${rec.method} ${rec.url}.`;
  const o = check.offers[unit.offerIndex!]!;
  return `At ${hhmm(rec.sentAt)} UTC we requested ${rec.method} ${rec.url} and replayed the 402 as a buyer that pays only in ${offerLabel(o, tokens)}.`;
}

/** "Yesterday it passed." / "On Oct 20 it failed: ..." */
function before(prev: UnitState, now: string): string {
  const y = new Date(Date.parse(`${day(now)}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const when = day(prev.lastSeen) === y ? 'Yesterday' : `On ${monthDay(prev.lastSeen)}`;
  const v = verdictOf(prev.outcome);
  if (v === 'passes') return `${when} it passed.`;
  if (v === 'down') return `${when} it ${prev.outcome === 'NETWORK_ERROR' ? 'did not answer' : `answered ${prev.detail.replace(/^HTTP /, '')}, not 402`}.`;
  if (v === 'not_judged') return `${when} it was outside what we judge: ${OUTCOME_NAME[prev.outcome]}.`;
  return `${when} it failed too, for another reason: ${OUTCOME_NAME[prev.outcome]}.`;
}

function indent(lines: string[], n = 2): string[] {
  return lines.map((l) => (l ? ' '.repeat(n) + l : l));
}

export interface ChangeItem {
  event: WatchEvent;
  check: EndpointCheck | null;
}

/** One event as a paragraph in the sample alert's shape. */
export function eventText(item: ChangeItem, tokens: TokenBook): string[] {
  const { event, check } = item;
  if (!check || !event.cur) {
    // The offer is gone from the 402.
    const prev = event.prev!;
    return [`${event.endpointKey}: the offer ${event.unitKey.replace(/^offer:/, '')} is no longer in the 402. It had failed since ${monthDay(prev.since)} (${OUTCOME_NAME[prev.outcome]}), so that failure is gone.`];
  }
  const unit = check.units.find((u) => u.key === event.unitKey)!;
  const { what, fix } = explain(check, unit, tokens);
  let history = '';
  if (event.prev) {
    history = event.kind === 'recovers' ? `It had failed since ${monthDay(event.prev.since)} (${OUTCOME_NAME[event.prev.outcome]}).` : before(event.prev, check.probe.sentAt);
  } else {
    history = 'This offer is new since the last run.';
  }
  const lead = [who(check, unit, tokens), what, history, fix ? `Fix: ${fix}` : ''].filter(Boolean).join(' ');
  const focus = unit.offerIndex !== null ? [unit.offerIndex] : null;
  return [lead, '', 'Request we sent', ...indent(requestBlock(check.probe)), '', 'What came back', ...indent(responseBlock(check.probe, check, focus))];
}

/** Drop an offer's event when the standard buyer's event already says the same thing about the same offer. */
export function mergeEvents(items: ChangeItem[]): ChangeItem[] {
  return items.filter((it) => {
    if (it.event.unitKey === 'standard' || !it.check || !it.event.cur) return true;
    const std = items.find((x) => x.event.endpointKey === it.event.endpointKey && x.event.unitKey === 'standard');
    if (!std || std.event.kind !== it.event.kind || std.event.cur?.outcome !== it.event.cur.outcome) return true;
    const stdUnit = std.check?.units.find((u) => u.key === 'standard');
    const unit = it.check.units.find((u) => u.key === it.event.unitKey);
    return !(stdUnit && unit && (stdUnit.offerIndex === unit.offerIndex || stdUnit.offerIndex === null));
  });
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export interface ChangeReportInput {
  subscriber: { id: string; name?: string };
  hosts: string[];
  at: string;
  items: ChangeItem[];
  /** Endpoints with no event this run: still passing, still failing, still outside what we judge. */
  steady: { passing: number; failing: { key: string; since: string; outcome: Outcome }[]; notJudged: number };
}

export function renderChangeReport(input: ChangeReportInput, tokens: TokenBook): string {
  const items = mergeEvents(input.items);
  const count = (k: WatchEvent['kind']) => new Set(items.filter((i) => i.event.kind === k).map((i) => i.event.endpointKey)).size;
  const broke = count('breaks');
  const recovered = count('recovers');
  const changed = count('changes');
  const parts = [broke ? `${plural(broke, 'endpoint')} broke` : '', recovered ? `${plural(recovered, 'endpoint')} recovered` : '', changed ? `${plural(changed, 'endpoint')} changed` : ''].filter(Boolean);
  const where = input.hosts.length === 1 ? input.hosts[0] : input.subscriber.name ?? `${input.hosts.length} hosts`;
  const out: string[] = [`Subject: x402 watch: ${where}, ${parts.join(', ')}`, ''];
  const order: WatchEvent['kind'][] = ['breaks', 'changes', 'recovers'];
  for (const k of order) {
    for (const it of items.filter((i) => i.event.kind === k)) {
      out.push(...eventText(it, tokens), '');
    }
  }
  const s = input.steady;
  const steady = [s.passing ? `${plural(s.passing, 'endpoint')} still ${s.passing === 1 ? 'passes' : 'pass'}` : '', ...s.failing.map((f) => `${f.key} still fails (${OUTCOME_NAME[f.outcome]}, since ${monthDay(f.since)})`), s.notJudged ? `${plural(s.notJudged, 'endpoint')} still outside what we judge` : ''].filter(Boolean);
  if (steady.length) out.push(`Unchanged since the last run: ${steady.join('; ')}.`, '');
  out.push(
    `How we check: once a day a standard x402 buyer (${STOCK_BUYER}) requests each endpoint once, without paying, and the payment is replayed offline with a throwaway key. We can't see what happens after a payment.`,
    '',
    'To stop the watch, reply "stop".',
  );
  return `${out.join('\n')}\n`;
}

export interface CheckReportInput {
  target: string;
  at: string;
  checks: EndpointCheck[];
  /** Endpoints listed but not requested, and why. */
  notProbed: { url: string; reason: string }[];
}

function endpointVerdict(c: EndpointCheck): string {
  const std = c.units.find((u) => u.key === 'standard')!;
  const offerFails = c.units.filter((u) => u.kind === 'offer' && u.verdict === 'fails').length;
  const v = std.verdict;
  if (v === 'fails') return 'a payment would fail';
  if (v === 'down') return std.outcome === 'NETWORK_ERROR' ? 'no answer' : 'no 402';
  if (v === 'not_judged') return 'reported, not judged';
  if (!offerFails) return 'passes';
  return offerFails === 1 ? 'passes; 1 offer fails on its own' : `passes; ${offerFails} offers fail on their own`;
}

/** The free first check: every endpoint, what the buyer did, and the fix. */
export function renderCheckReport(input: CheckReportInput, tokens: TokenBook): string {
  const out: string[] = [];
  const n = input.checks.length;
  const std = input.checks.map((c) => c.units.find((u) => u.key === 'standard')!);
  const fails = std.filter((u) => u.verdict === 'fails').length;
  const passes = std.filter((u) => u.verdict === 'passes').length;
  const offerFails = input.checks.filter((c, i) => std[i]!.verdict !== 'fails' && c.units.some((u) => u.kind === 'offer' && u.verdict === 'fails')).length;
  out.push(`x402 check: ${input.target}`, '');
  out.push(
    `Run ${input.at.slice(0, 16).replace('T', ' ')} UTC. A standard x402 buyer (${STOCK_BUYER}) requested each paid endpoint once, without paying, and we replayed the payment offline with a throwaway key. Each offer was also tried on its own, as a buyer who pays only with that offer would.`,
    '',
  );
  const other = n - fails - passes;
  const summary = [
    `${plural(n, 'endpoint')} checked.`,
    fails ? `${fails} would make a standard buyer's payment fail.` : '',
    passes ? `${passes} pass${offerFails ? `, and on ${offerFails} of those an offer fails on its own` : ''}.` : '',
    other ? `${other} not judged or not answering 402.` : '',
  ].filter(Boolean);
  out.push(`Summary: ${summary.join(' ')}`, '');
  input.checks.forEach((c, i) => {
    out.push(`${i + 1}. ${c.method} ${c.url}: ${endpointVerdict(c)}`);
    const s = std[i]!;
    const e = explain(c, s, tokens);
    out.push(...indent([[who(c, s, tokens), e.what, e.fix ? `Fix: ${e.fix}` : ''].filter(Boolean).join(' ')]));
    const offerUnits = c.units.filter((u) => u.kind === 'offer');
    const extra = offerUnits.filter((u) => u.verdict === 'fails' && !(u.offerIndex === s.offerIndex && u.outcome === s.outcome));
    for (const u of extra) {
      const x = explain(c, u, tokens);
      out.push('', ...indent([[who(c, u, tokens), x.what, x.fix ? `Fix: ${x.fix}` : ''].filter(Boolean).join(' ')]));
    }
    out.push('', '  Request we sent', ...indent(requestBlock(c.probe), 4), '', '  What came back', ...indent(responseBlock(c.probe, c, null, tokens), 4));
    if (offerUnits.length || c.skipped.length) {
      out.push('', '  Each offer on its own');
      for (const u of offerUnits) {
        const what = u.outcome === 'SIGNS_VALID_AUTHORIZATION' ? 'passes' : OUTCOME_NAME[u.outcome];
        out.push(`    accepts[${u.offerIndex}] ${offerLabel(c.offers[u.offerIndex!]!, tokens)}: ${what}`);
      }
      for (const sk of c.skipped) out.push(`    accepts[${sk.offerIndex}] ${String(c.offers[sk.offerIndex]?.network)}: not tried, ${sk.reason}`);
    }
    const notes = c.findings.filter((f) => f.class !== '-');
    if (notes.length) {
      out.push('', '  Lint notes (the field-level findings behind the result)');
      for (const f of notes.slice(0, 12)) out.push(`    ${f.acceptIndex !== undefined ? `accepts[${f.acceptIndex}] ` : ''}class ${f.class} ${f.code}: ${f.detail}`);
      if (notes.length > 12) out.push(`    (${notes.length - 12} more)`);
    }
    out.push('');
  });
  if (input.notProbed.length) {
    out.push('Listed but not requested');
    for (const p of input.notProbed) out.push(`  ${p.url}: ${p.reason}`);
    out.push('');
  }
  out.push(
    "What this can't see: what happens after a payment (your handler, your facilitator's uptime). Offers on non-EVM chains and prices above the stock client's $1 cap are reported, not judged.",
    '',
    `Keep the watch: one run a day, and an email only when an endpoint breaks or recovers, with the request we sent, what came back and the fix. $10 a month in USDC on Base, paid to the address on ${WATCH_PAGE} (copy it from that page, never from a transaction history). Reply to start, or to ask anything.`,
  );
  return `${out.join('\n')}\n`;
}

