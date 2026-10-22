/**
 * What a stock buyer does with one endpoint, in the Oct 21 lint run's outcome classes
 * (stock_outcomes.py, ported line for line in `classify`). Two buyers are replayed:
 *
 * - the standard buyer: @x402/fetch with its defaults, on the whole 402;
 * - per offer: the same client on that offer alone, opted in to any token
 *   (allowedAssets: true), as a buyer who pays only on that network, in that token, would.
 *
 * NO_402_RESPONSE and NETWORK_ERROR are probe states, not x402 classes: the endpoint
 * answered something other than a 402, or nothing at all.
 */
import { bodyJson, isObject, offersOf, paymentRequired, withAccepts, type Json, type Offer } from './challenge.js';
import { lintRecord, type Finding } from './lint.js';
import { TESTNET_NETS, V1_EVM, evmCaip2 } from './networks.js';
import type { ProbeRecord } from './probe.js';
import { replay, type BuyerProfile, type Replay } from './replay.js';
import { domainMatches, factsFor, type TokenBook } from './tokens.js';

export type Outcome =
  | 'SIGNS_VALID_AUTHORIZATION'
  | 'SIGNS_DOMAIN_UNVERIFIED'
  | 'FAIL_NO_X402_CHALLENGE'
  | 'FAIL_V2_BODY_ONLY_NO_HEADER'
  | 'FAIL_V1_NETWORK_NAMES_IN_V2'
  | 'FAIL_ASSET_NOT_A_CONTRACT'
  | 'FAIL_WRONG_EIP712_DOMAIN'
  | 'FAIL_TOKEN_HAS_NO_EIP3009'
  | 'FAIL_OTHER'
  | 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY'
  | 'OUT_OF_SCOPE_NO_EVM_EXACT_OFFER'
  | 'OUT_OF_SCOPE_NON_DEFAULT_TOKEN_ONLY'
  | 'POLICY_OVER_1_USD_DEFAULT_CAP'
  | 'TESTNET_ONLY_OFFER_SELECTED'
  | 'NO_402_RESPONSE'
  | 'NETWORK_ERROR';

const FAIL: ReadonlySet<Outcome> = new Set<Outcome>([
  'FAIL_NO_X402_CHALLENGE',
  'FAIL_V2_BODY_ONLY_NO_HEADER',
  'FAIL_V1_NETWORK_NAMES_IN_V2',
  'FAIL_ASSET_NOT_A_CONTRACT',
  'FAIL_WRONG_EIP712_DOMAIN',
  'FAIL_TOKEN_HAS_NO_EIP3009',
  'FAIL_OTHER',
  'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY',
]);
const NOT_JUDGED: ReadonlySet<Outcome> = new Set<Outcome>([
  'OUT_OF_SCOPE_NO_EVM_EXACT_OFFER',
  'OUT_OF_SCOPE_NON_DEFAULT_TOKEN_ONLY',
  'POLICY_OVER_1_USD_DEFAULT_CAP',
  'TESTNET_ONLY_OFFER_SELECTED',
]);
const DOWN: ReadonlySet<Outcome> = new Set<Outcome>(['NO_402_RESPONSE', 'NETWORK_ERROR']);

/** fails: a payment would fail or stay open over a day. down: no 402 to pay. not_judged: outside what the stock buyer is judged on. */
export type Verdict = 'passes' | 'fails' | 'not_judged' | 'down';

export function verdictOf(o: Outcome): Verdict {
  if (FAIL.has(o)) return 'fails';
  if (NOT_JUDGED.has(o)) return 'not_judged';
  if (DOWN.has(o)) return 'down';
  return 'passes';
}

/** Broken from the buyer's side: it can't pay, or it signs something it shouldn't. */
export const isBroken = (o: Outcome) => verdictOf(o) === 'fails' || verdictOf(o) === 'down';


const isEvmExactMainnet = (a: Offer) => {
  const caip = evmCaip2(a.network);
  return caip !== null && a.scheme === 'exact' && !TESTNET_NETS.has(caip);
};

/** stock_outcomes.py, for one 402 and one replay: the outcome class and the lint run's detail line. */
export function classify(rec: ProbeRecord, accepts: Offer[], version: Json | undefined, sim: Replay, tokens: TokenBook): { outcome: Outcome; detail: string } {
  const body = bodyJson(rec);
  const hasEvmMain = accepts.some(isEvmExactMainnet);
  const hasEvmTest = accepts.some((a) => a.scheme === 'exact' && TESTNET_NETS.has(evmCaip2(a.network) ?? ''));
  const hasCaipEvm = accepts.some((a) => typeof a.network === 'string' && a.network.startsWith('eip155:') && a.scheme === 'exact');

  if (accepts.length === 0 && paymentRequired(rec) === null && !(isObject(body) && 'accepts' in body)) {
    return { outcome: 'FAIL_NO_X402_CHALLENGE', detail: '402 without x402 accepts in header or body' };
  }
  if (!sim.ok) {
    const err = sim.error ?? '';
    if (err.startsWith('Invalid payment required response')) return { outcome: 'FAIL_V2_BODY_ONLY_NO_HEADER', detail: err };
    if (err.startsWith('No network/scheme registered')) {
      const legacy = accepts.filter((a) => typeof a.network === 'string' && a.network in V1_EVM && a.scheme === 'exact');
      if (version === 2 && legacy.length && !hasCaipEvm) return { outcome: 'FAIL_V1_NETWORK_NAMES_IN_V2', detail: 'only v1 network names on a v2 challenge' };
      if (!hasEvmMain && !hasEvmTest) {
        const nets = [...new Set(accepts.map((a) => `${String(a.network)}/${String(a.scheme)}`))].sort().join(',');
        return { outcome: 'OUT_OF_SCOPE_NO_EVM_EXACT_OFFER', detail: nets.slice(0, 160) };
      }
      return { outcome: 'FAIL_OTHER', detail: err.slice(0, 160) };
    }
    if (err.includes('spendControls.maxAmountPerPayment')) return { outcome: 'POLICY_OVER_1_USD_DEFAULT_CAP', detail: '' };
    if (err.includes('only default assets')) {
      const nocode = accepts.filter((a) => isEvmExactMainnet(a) && factsFor(tokens, evmCaip2(a.network)!, String(a.asset))?.codeBytes === 0);
      if (nocode.length) return { outcome: 'FAIL_ASSET_NOT_A_CONTRACT', detail: String(nocode[0]!.asset) };
      const assets = [...new Set(accepts.map((a) => `${String(a.network)}:${String(a.asset)}`))].sort().join(',');
      return { outcome: 'OUT_OF_SCOPE_NON_DEFAULT_TOKEN_ONLY', detail: assets.slice(0, 160) };
    }
    return { outcome: 'FAIL_OTHER', detail: err.slice(0, 160) };
  }

  const sel = sim.selected ?? null;
  const caip = evmCaip2(sel?.network) ?? '';
  const ex = isObject(sel?.extra) ? sel!.extra : {};
  const method = typeof ex.assetTransferMethod === 'string' && ex.assetTransferMethod ? ex.assetTransferMethod : 'eip3009';
  const asset = String(sel?.asset);
  const info = factsFor(tokens, caip, asset);
  const vs = sim.validitySeconds ?? 0;
  const dm = info && typeof ex.name === 'string' && typeof ex.version === 'string' ? domainMatches(info, ex.name, ex.version) : null;
  const eip3009 = method === 'eip3009';
  if (TESTNET_NETS.has(caip)) return { outcome: 'TESTNET_ONLY_OFFER_SELECTED', detail: String(sel?.network) };
  if (info?.codeBytes === 0) return { outcome: 'FAIL_ASSET_NOT_A_CONTRACT', detail: asset };
  if (eip3009 && dm === false) {
    return {
      outcome: 'FAIL_WRONG_EIP712_DOMAIN',
      detail: `${String(sel?.network)} name='${String(ex.name)}' version='${String(ex.version)}' vs on-chain '${info?.name ?? null}'/'${info?.version ?? null}'`,
    };
  }
  if (eip3009 && info?.eip3009 === false) return { outcome: 'FAIL_TOKEN_HAS_NO_EIP3009', detail: `${String(sel?.network)} ${asset}` };
  if (vs > 86400) return { outcome: 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY', detail: `${vs} s (${(vs / 86400).toFixed(1)} days)` };
  if (eip3009 && dm === null) return { outcome: 'SIGNS_DOMAIN_UNVERIFIED', detail: `${String(sel?.network)} ${asset}` };
  return { outcome: 'SIGNS_VALID_AUTHORIZATION', detail: `${String(sel?.network)} ${method} validity ${vs}s` };
}

export interface Unit {
  /** 'standard', or 'offer:<caip2>:<asset>:<method>' */
  key: string;
  kind: 'standard' | 'offer';
  outcome: Outcome;
  verdict: Verdict;
  detail: string;
  /** The offer this buyer paid with (or was refused on): an index into the 402's accepts. */
  offerIndex: number | null;
  replay?: Replay;
}

export interface Skipped {
  offerIndex: number;
  reason: string;
}

export interface EndpointCheck {
  url: string;
  method: string;
  probe: ProbeRecord;
  offers: Offer[];
  version: Json | undefined;
  units: Unit[];
  /** Offers no unit was replayed for, and why. */
  skipped: Skipped[];
  findings: Finding[];
}

export function offerKey(o: Offer): string {
  const caip = evmCaip2(o.network) ?? String(o.network);
  const ex = isObject(o.extra) ? o.extra : {};
  const method = typeof ex.assetTransferMethod === 'string' && ex.assetTransferMethod ? ex.assetTransferMethod : 'eip3009';
  return `offer:${caip}:${String(o.asset).toLowerCase()}:${method}`;
}

/** Which offer a payment used: same scheme, network and asset (and amount and payTo when given). */
function indexOfSelected(offers: Offer[], sel: Replay['selected']): number | null {
  if (!sel) return null;
  const same = (a: Json | undefined, b: Json | undefined) => String(a).toLowerCase() === String(b).toLowerCase();
  const i = offers.findIndex(
    (o) => same(o.scheme, sel.scheme) && same(o.network, sel.network) && same(o.asset, sel.asset) && same(o.payTo, sel.payTo) && same(o.amount ?? o.maxAmountRequired, sel.amount),
  );
  if (i >= 0) return i;
  const j = offers.findIndex((o) => same(o.scheme, sel.scheme) && same(o.network, sel.network) && same(o.asset, sel.asset));
  return j >= 0 ? j : null;
}

/** When the standard buyer stopped before choosing an offer: the offer the failure is about, if there is one. */
function offerBehind(offers: Offer[], outcome: Outcome, detail: string): number | null {
  if (outcome === 'FAIL_ASSET_NOT_A_CONTRACT') {
    const i = offers.findIndex((o) => String(o.asset).toLowerCase() === detail.toLowerCase());
    if (i >= 0) return i;
  }
  if (outcome === 'FAIL_V1_NETWORK_NAMES_IN_V2') {
    const legacy = offers.map((o, i) => [o, i] as const).filter(([o]) => typeof o.network === 'string' && o.network in V1_EVM);
    if (legacy.length === 1) return legacy[0]![1];
  }
  return offers.length === 1 ? 0 : null;
}

/** Why the per-offer buyer leaves an offer alone, or null to replay it. */
function skipReason(o: Offer, offers: Offer[], version: Json | undefined): string | null {
  const caip = evmCaip2(o.network);
  if (!caip) return 'not an EVM network: reported, not judged';
  if (o.scheme !== 'exact') return `scheme '${String(o.scheme)}': the stock EVM buyer pays 'exact' offers only`;
  if (TESTNET_NETS.has(caip)) return 'a testnet offer';
  const ex = isObject(o.extra) ? o.extra : {};
  if (ex.name === 'GatewayWalletBatched') return 'a Circle Gateway batched offer, for Gateway-aware buyers';
  // lint run: a duplicate 'base' offer next to a correct eip155:8453 one is cosmetic for a stock buyer.
  if (version === 2 && typeof o.network === 'string' && !o.network.includes(':')) {
    const twin = offers.some((p) => p !== o && p.network === caip && String(p.asset).toLowerCase() === String(o.asset).toLowerCase() && p.scheme === 'exact');
    if (twin) return `a v1-named duplicate of the ${caip} offer, which a stock buyer uses instead`;
  }
  return null;
}

const PARSE_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAIL_NO_X402_CHALLENGE', 'FAIL_V2_BODY_ONLY_NO_HEADER']);

/** Classify one probe: the standard buyer, then each offer alone. */
export async function checkEndpoint(rec: ProbeRecord, tokens: TokenBook): Promise<EndpointCheck> {
  const base = { url: rec.url, method: rec.method, probe: rec };
  if (rec.status === null) {
    return { ...base, offers: [], version: undefined, skipped: [], findings: [], units: [{ key: 'standard', kind: 'standard', outcome: 'NETWORK_ERROR', verdict: 'down', detail: rec.error ?? '', offerIndex: null }] };
  }
  if (rec.status !== 402) {
    const loc = rec.headers?.location;
    return {
      ...base,
      offers: [],
      version: undefined,
      skipped: [],
      findings: [],
      units: [{ key: 'standard', kind: 'standard', outcome: 'NO_402_RESPONSE', verdict: 'down', detail: `HTTP ${rec.status}${loc ? ` to ${loc}` : ''}`, offerIndex: null }],
    };
  }
  const { accepts, version } = offersOf(rec);
  const findings = lintRecord(rec, tokens);
  const units: Unit[] = [];
  const skipped: Skipped[] = [];

  const std = await replay(rec, 'standard');
  const s = classify(rec, accepts, version, std, tokens);
  const chosen = indexOfSelected(accepts, std.selected) ?? (std.ok ? null : offerBehind(accepts, s.outcome, s.detail));
  units.push({ key: 'standard', kind: 'standard', ...s, verdict: verdictOf(s.outcome), offerIndex: chosen, replay: std });

  if (std.stage !== 'parse' && !PARSE_FAILURES.has(s.outcome)) {
    const seen = new Map<string, number>();
    for (const [i, o] of accepts.entries()) {
      const why = skipReason(o, accepts, version);
      if (why) {
        skipped.push({ offerIndex: i, reason: why });
        continue;
      }
      let key = offerKey(o);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n > 1) key = `${key}#${n}`;
      const sub = withAccepts(rec, [o]);
      const profile: BuyerProfile = 'any-token';
      const r = await replay(sub, profile);
      const c = classify(sub, [o], version, r, tokens);
      units.push({ key, kind: 'offer', ...c, verdict: verdictOf(c.outcome), offerIndex: i, replay: r });
    }
  }
  return { ...base, offers: accepts, version, units, skipped, findings };
}

/** Every (chain, asset) pair whose token facts a check needs. */
export function tokenPairs(records: ProbeRecord[]): [string, string][] {
  const out: [string, string][] = [];
  for (const rec of records) {
    if (rec.status !== 402) continue;
    for (const o of offersOf(rec).accepts) {
      const caip = evmCaip2(o.network);
      if (caip && typeof o.asset === 'string' && /^0x[0-9a-fA-F]{40}$/.test(o.asset)) out.push([caip, o.asset]);
    }
  }
  return out;
}
