/**
 * Reading a recorded 402: the challenge a stock @x402/fetch client would parse, and
 * the offers the lint run classified (analyze.py `challenge`, stock_outcomes.py `offers`).
 */
import type { ProbeRecord } from './probe.js';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Offer = Record<string, Json>;
export type Challenge = Record<string, Json>;

/** @x402/core's Base64EncodedRegex: the only header encoding the stock client accepts. */
export const B64_STOCK = /^[A-Za-z0-9+/]*={0,2}$/;

export function isObject(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Decode a PAYMENT-REQUIRED header leniently (padding, URL-safe alphabet), noting what a stock client would refuse. */
export function decodeHeader(raw: string | undefined): { obj: Challenge | null; issues: string[] } {
  if (raw === undefined) return { obj: null, issues: [] };
  const issues: string[] = [];
  if (!B64_STOCK.test(raw)) issues.push('header_not_stock_base64');
  try {
    const std = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
    const obj = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown;
    return { obj: isObject(obj) ? obj : null, issues };
  } catch {
    issues.push('header_undecodable');
    return { obj: null, issues };
  }
}

export function bodyJson(rec: ProbeRecord): Json | undefined {
  if (rec.bodyText === undefined || rec.bodyText === '') return undefined;
  try {
    return JSON.parse(rec.bodyText) as Json;
  } catch {
    return undefined;
  }
}

export function paymentRequired(rec: ProbeRecord): Challenge | null {
  return decodeHeader(rec.headers?.['payment-required']).obj;
}

export interface ParsedChallenge {
  /** The decoded header, if any. */
  header: Challenge | null;
  headerIssues: string[];
  /** A body that looks like an x402 challenge. */
  bodyChallenge: Challenge | null;
  /** What the stock client reads: the header, else a v1 body. */
  stock: Challenge | null;
  source: 'header' | 'body_v1' | null;
}

export function parseChallenge(rec: ProbeRecord): ParsedChallenge {
  const raw = rec.headers?.['payment-required'];
  const { obj: header, issues: headerIssues } = decodeHeader(raw);
  const body = bodyJson(rec);
  const bodyChallenge = isObject(body) && ('accepts' in body || 'x402Version' in body) ? body : null;
  if (raw !== undefined) {
    const stock = headerIssues.length === 0 || (headerIssues.length === 1 && headerIssues[0] === 'header_not_stock_base64') ? header : null;
    return { header, headerIssues, bodyChallenge, stock, source: 'header' };
  }
  if (bodyChallenge && bodyChallenge.x402Version === 1) {
    return { header: null, headerIssues, bodyChallenge, stock: bodyChallenge, source: 'body_v1' };
  }
  return { header: null, headerIssues, bodyChallenge, stock: null, source: null };
}

export function acceptsOf(ch: Challenge | null | undefined): Offer[] {
  const acc = ch?.accepts;
  return Array.isArray(acc) ? acc.filter(isObject) : [];
}

/** The offers and version the lint run classified: the decoded header, else the body. */
export function offersOf(rec: ProbeRecord): { accepts: Offer[]; version: Json | undefined; fromHeader: boolean } {
  const header = paymentRequired(rec);
  const body = bodyJson(rec);
  const src = header ?? (isObject(body) ? body : null);
  return { accepts: acceptsOf(src), version: src?.x402Version, fromHeader: header !== null };
}

/** The same response with the challenge cut down to `accepts`: one offer, replayed as if it were the only one. */
export function withAccepts(rec: ProbeRecord, accepts: Offer[]): ProbeRecord {
  const header = paymentRequired(rec);
  if (header && rec.headers?.['payment-required'] !== undefined) {
    const encoded = Buffer.from(JSON.stringify({ ...header, accepts }), 'utf8').toString('base64');
    return { ...rec, headers: { ...rec.headers, 'payment-required': encoded } };
  }
  const body = bodyJson(rec);
  if (isObject(body)) return { ...rec, bodyText: JSON.stringify({ ...body, accepts }) };
  return rec;
}
