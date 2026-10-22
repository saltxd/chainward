/**
 * Per-offer findings, ported from the Oct 21 lint run (lintlib.py `lint_accept`,
 * `resource_issues`, and the record-level checks in analyze.py). Classes and codes
 * are the lint run's; nothing new is invented here. The stock-buyer outcome in
 * classify.ts decides pass or fail; these findings explain and add the field to fix.
 */
import { acceptsOf, isObject, parseChallenge, type Json, type Offer } from './challenge.js';
import { MAINNET_ASSETS, TESTNET_ASSETS, TESTNET_NETS, evmCaip2 } from './networks.js';
import type { ProbeRecord } from './probe.js';
import { domainMatches, factsFor, type TokenBook } from './tokens.js';

export interface Finding {
  class: string;
  code: string;
  detail: string;
  acceptIndex?: number;
  network?: Json;
}

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const ATOMIC = /^\d+$/;
const PERMIT2_METHODS = new Set(['permit2', 'permit2-exact']);

const repr = (v: unknown): string => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v) ?? String(v));

/** Findings for one accepts[] entry (lintlib.lint_accept). */
export function lintOffer(acc: Offer, version: Json | undefined, tokens: TokenBook): Finding[] {
  const out: Finding[] = [];
  const f = (cls: string, code: string, detail: string) => out.push({ class: cls, code, detail });
  const net = acc.network;
  const caip = evmCaip2(net);
  const scheme = acc.scheme;
  const extra = isObject(acc.extra) ? acc.extra : {};
  const method = extra.assetTransferMethod;

  // class 6: network id vs version
  if (typeof net === 'string') {
    if (version === 2 && !net.includes(':')) f('6', 'v2_legacy_network', `x402Version 2 with network ${repr(net)}`);
    if (version === 1 && net.startsWith('eip155:')) f('6', 'v1_caip2_network', `x402Version 1 with network ${repr(net)}`);
  }

  // class 2: maxTimeoutSeconds (Circle Gateway batched offers ask >= 7 days by design)
  const gateway = extra.name === 'GatewayWalletBatched';
  const mts = acc.maxTimeoutSeconds;
  if (!('maxTimeoutSeconds' in acc)) f('2', 'timeout_missing', 'no maxTimeoutSeconds');
  else if (typeof mts === 'boolean' || (typeof mts !== 'number' && typeof mts !== 'string')) f('2', 'timeout_type', `maxTimeoutSeconds type ${mts === null ? 'null' : typeof mts}`);
  else if (typeof mts === 'string') f('2', 'timeout_string', `maxTimeoutSeconds is the string ${repr(mts)}`);
  else if (!Number.isInteger(mts)) f('2', 'timeout_float', `maxTimeoutSeconds ${mts}`);
  else if (mts > 1_000_000_000) f('2', 'timeout_timestamp', `maxTimeoutSeconds ${mts} looks like a Unix time`);
  else if (mts > 86400 && !gateway) f('2', 'timeout_over_1d', `maxTimeoutSeconds ${mts} (${(mts / 86400).toFixed(1)} days)`);
  else if (mts <= 5) f('2', 'timeout_too_small', `maxTimeoutSeconds ${mts}`);

  // class 5 and 8: amount field and format
  let amtKey = version === 1 ? 'maxAmountRequired' : 'amount';
  let amt = acc[amtKey];
  if (amt === undefined && version === 1 && 'amount' in acc) {
    amtKey = 'amount';
    amt = acc.amount;
    f('8', 'v1_uses_amount', "x402Version 1 accept uses 'amount' not 'maxAmountRequired'");
  }
  if (amt === undefined && version === 2 && 'maxAmountRequired' in acc) {
    amtKey = 'maxAmountRequired';
    amt = acc.maxAmountRequired;
    f('8', 'v2_uses_maxAmountRequired', "x402Version 2 accept uses 'maxAmountRequired' not 'amount'");
  }
  if (amt === undefined || amt === null) f('5', 'amount_missing', `no ${amtKey}`);
  else if (typeof amt === 'string') {
    if (!ATOMIC.test(amt)) f('5', 'amount_not_atomic', `${amtKey} ${repr(amt)}`);
    else if (BigInt(amt) === 0n) f('5', 'amount_zero', `${amtKey} 0`);
  } else if (typeof amt !== 'number' || !Number.isInteger(amt)) f('5', 'amount_not_atomic', `${amtKey} ${repr(amt)}`);
  else f('5', 'amount_number_type', `${amtKey} is a JSON number ${amt}`);

  if (!caip) return out;

  // class 3: asset
  const asset = acc.asset;
  if (typeof asset !== 'string' || !EVM_ADDR.test(asset)) f('3', 'asset_malformed', `asset ${repr(asset)}`);
  else {
    const al = asset.toLowerCase();
    if (!TESTNET_NETS.has(caip) && TESTNET_ASSETS[al]) f('3', 'testnet_asset_on_mainnet', `${asset} is ${TESTNET_ASSETS[al]} USDC under ${repr(net)}`);
    if (TESTNET_NETS.has(caip) && MAINNET_ASSETS[al]) f('3', 'mainnet_asset_on_testnet', `${asset} is ${MAINNET_ASSETS[al]} USDC under ${repr(net)}`);
    const info = factsFor(tokens, caip, asset);
    if (info && !info.error && info.codeBytes === 0) f('3', 'asset_not_contract', `eth_getCode(${asset}) on ${caip} is 0x`);
    if (info && info.codeBytes && scheme === 'exact' && !PERMIT2_METHODS.has(String(method)) && info.eip3009 === false) {
      f('8', 'asset_no_eip3009', `${asset} on ${caip} has no authorizationState (EIP-3009) but accept has no permit2`);
    }
  }

  // class 4: payTo
  const pay = acc.payTo;
  if (typeof pay !== 'string' || !EVM_ADDR.test(pay)) f('4', 'payto_malformed', `payTo ${repr(pay)}`);
  else {
    if (BigInt(pay) === 0n) f('4', 'payto_zero', 'payTo is the zero address');
    if (typeof asset === 'string' && pay.toLowerCase() === asset.toLowerCase()) f('4', 'payto_is_asset', 'payTo equals the asset contract');
  }

  // class 1 / 8: EIP-712 domain for EIP-3009 exact
  if (scheme === 'exact' && !PERMIT2_METHODS.has(String(method)) && !gateway) {
    const { name, version: ver } = extra;
    if (!name || !ver) f('8', 'missing_eip712_domain', `extra.name=${repr(name ?? null)} extra.version=${repr(ver ?? null)}: @x402/evm throws before signing`);
    else if (typeof asset === 'string' && EVM_ADDR.test(asset) && typeof name === 'string' && typeof ver === 'string') {
      const info = factsFor(tokens, caip, asset);
      if (info && domainMatches(info, name, ver) === false) {
        f('1', 'eip712_domain_mismatch', `extra {name ${repr(name)}, version ${repr(ver)}} does not hash to ${asset}'s DOMAIN_SEPARATOR on ${caip}`);
      }
    }
  }
  return out;
}

/** The challenge's resource URL against the URL we probed (lintlib.resource_issues). */
export function resourceIssues(resourceUrl: unknown, probedUrl: string): Finding[] {
  if (typeof resourceUrl !== 'string' || !resourceUrl) return [];
  let u: URL;
  let p: URL;
  try {
    u = new URL(resourceUrl);
    p = new URL(probedUrl);
  } catch {
    return [{ class: '7', code: 'resource_unparseable', detail: repr(resourceUrl).slice(0, 120) }];
  }
  const out: Finding[] = [];
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') out.push({ class: '7', code: 'resource_http', detail: resourceUrl.slice(0, 200) });
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(host) || host.endsWith('.local') || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    out.push({ class: '7', code: 'resource_localhost', detail: resourceUrl.slice(0, 200) });
  } else if (host && host !== p.hostname.toLowerCase()) {
    out.push({ class: '7', code: 'resource_other_host', detail: `${resourceUrl.slice(0, 200)} vs probed ${p.hostname}` });
  }
  return out;
}

const keyOf = (a: Offer) => `${String(a.network)}|${String(a.scheme)}`;

/** Every finding for one recorded 402 (analyze.py's per-record pass, without the catalog price check). */
export function lintRecord(rec: ProbeRecord, tokens: TokenBook): Finding[] {
  if (rec.status !== 402) return [];
  const ch = parseChallenge(rec);
  const findings: Finding[] = [];
  if ((rec.headerBytes ?? 0) > 16384) {
    findings.push({ class: '8', code: 'headers_over_16k', detail: `402 response headers ~${rec.headerBytes} bytes; Node fetch default maxHeaderSize is 16384` });
  }
  for (const code of ch.headerIssues) findings.push({ class: '8', code, detail: 'PAYMENT-REQUIRED header' });
  if (ch.source === null) {
    if (ch.bodyChallenge && ch.bodyChallenge.x402Version === 2) {
      findings.push({ class: '8', code: 'v2_no_header', detail: 'x402Version 2 challenge only in JSON body; @x402/fetch reads v2 only from PAYMENT-REQUIRED' });
    } else if (ch.bodyChallenge) {
      findings.push({ class: '8', code: 'body_unversioned', detail: `body x402Version ${repr(ch.bodyChallenge.x402Version ?? null)}, no header` });
    } else if (rec.headers?.['www-authenticate'] !== undefined) {
      findings.push({ class: '-', code: 'mpp_only', detail: 'no x402 challenge; WWW-Authenticate only' });
    } else {
      findings.push({ class: '-', code: 'no_challenge', detail: '402 without x402 challenge' });
    }
  }
  const pr = ch.stock;
  if (!pr) return findings;
  const ver = pr.x402Version;
  if (typeof ver !== 'number' || !Number.isInteger(ver)) findings.push({ class: '8', code: 'version_type', detail: `x402Version ${repr(ver ?? null)}` });
  const accepts = acceptsOf(pr);
  if (accepts.length === 0) findings.push({ class: '8', code: 'no_accepts', detail: 'accepts missing or empty' });
  const res = pr.resource;
  let resUrl: unknown = isObject(res) ? res.url : typeof res === 'string' ? res : undefined;
  if (ver === 1) for (const a of accepts) if (typeof a.resource === 'string') resUrl = resUrl ?? a.resource;
  findings.push(...resourceIssues(resUrl, rec.url));
  accepts.forEach((a, i) => {
    for (const fnd of lintOffer(a, ver, tokens)) findings.push({ ...fnd, acceptIndex: i, network: a.network ?? null });
  });
  // header vs body consistency
  if (ch.source === 'header' && ch.bodyChallenge) {
    const hb = accepts;
    const bb = acceptsOf(ch.bodyChallenge);
    const bodyVer = ch.bodyChallenge.x402Version;
    if (bodyVer !== undefined && bodyVer !== null && bodyVer !== ver) {
      findings.push({ class: '8', code: 'version_header_body_mismatch', detail: `header v${String(ver)} body v${String(bodyVer)}` });
    }
    if (hb.length && bb.length) {
      const hk = new Map(hb.map((a) => [keyOf(a), a]));
      const bk = new Map(bb.map((a) => [keyOf(a), a]));
      for (const [k, h] of hk) {
        const b = bk.get(k);
        if (!b) continue;
        for (const fld of ['payTo', 'asset'] as const) {
          if (String(h[fld]).toLowerCase() !== String(b[fld]).toLowerCase()) {
            findings.push({ class: '4', code: `${fld.toLowerCase()}_header_body_mismatch`, detail: `${k}: header ${String(h[fld])} body ${String(b[fld])}` });
          }
        }
        const ha = h.amount ?? h.maxAmountRequired;
        const ba = b.amount ?? b.maxAmountRequired;
        if (String(ha) !== String(ba)) findings.push({ class: '4', code: 'amount_header_body_mismatch', detail: `${k}: header ${String(ha)} body ${String(ba)}` });
      }
      const hs = [...hk.keys()].sort();
      const bs = [...bk.keys()].sort();
      if (hs.join() !== bs.join()) findings.push({ class: '8', code: 'accepts_header_body_differ', detail: `header ${hs.join(', ')} body ${bs.join(', ')}` });
    }
  }
  return findings;
}
