/**
 * One polite, unpaid request to a seller's endpoint: the rules of the Oct 21
 * re-probe (outreach_reprobe.py). No payment headers and no credentials, ever; a
 * POST carries `{}` unless the watch list gives a sample body; redirects are
 * recorded, never followed; requests run one at a time, at least 1.2 s apart.
 *
 * Seller-supplied URLs are untrusted: a host that resolves to a private, loopback,
 * link-local or carrier-grade NAT address is refused, so a check can never reach
 * the machine's own network.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const USER_AGENT = 'chainward-x402-lint/1.0 (+https://chainward.ai)';
export const GAP_MS = 1200;
export const TIMEOUT_MS = 10_000;
export const MAX_BODY = 262_144;
/** Node's default is 16 KiB; some 402s carry 30 KB of headers, which the lint run read in full. */
const MAX_HEADER_BYTES = 65_536;
/** Headers kept whole; every other header value is cut at 8 KiB, as the lint run did. */
const FULL_HEADERS = new Set(['payment-required', 'x-payment-required']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export interface Target {
  url: string;
  method?: string;
  /** A sample request body the seller gave us; POST defaults to `{}`. */
  body?: string;
}

export interface ProbeRecord {
  url: string;
  method: string;
  /** Request start, UTC, second precision. */
  sentAt: string;
  request: { headers: Record<string, string>; body?: string };
  /** null when no HTTP response came back. */
  status: number | null;
  error?: string;
  elapsedMs?: number;
  /** Lower-cased names. */
  headers?: Record<string, string>;
  headerBytes?: number;
  bodyText?: string;
  bodyTruncated?: boolean;
}

/** Spaces requests: each starts at least `gapMs` after the previous one finished. */
export class Pacer {
  private lastEnd = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly gapMs = GAP_MS,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async wait(): Promise<void> {
    const wait = this.lastEnd + this.gapMs - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  done(): void {
    this.lastEnd = this.now();
  }
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function v4Public(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
  });
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!;
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]!);
    s = s.slice(0, -v4[1]!.length) + `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(fill, 0)).fill('0'), ...t];
  if (parts.length !== 8) return null;
  return parts.map((p) => parseInt(p, 16));
}

/** True for an address on the public internet; false for private, loopback, link-local, CGNAT, multicast or documentation ranges. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Public(ip);
  if (kind !== 6) return false;
  const w = expandV6(ip);
  if (!w) return false;
  const [a, b] = [w[0]!, w[1]!];
  if (w.every((x) => x === 0)) return false; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return false; // ::1
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) {
    return v4Public(`${w[6]! >>> 8}.${w[6]! & 255}.${w[7]! >>> 8}.${w[7]! & 255}`); // ::ffff:a.b.c.d
  }
  if (a === 0x64 && b === 0xff9b) return v4Public(`${w[6]! >>> 8}.${w[6]! & 255}.${w[7]! >>> 8}.${w[7]! & 255}`); // NAT64
  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return false; // multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return false; // discard
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses any host with a non-public address, so a later connect can't be steered inward. */
export function guardedLookup(hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback): void {
  const all = typeof options === 'object' && options?.all === true;
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, all ? [] : '');
    const list = addresses as LookupAddress[];
    const blocked = list.find((a) => !isPublicAddress(a.address));
    if (blocked || list.length === 0) {
      const e = new Error(`refused: ${hostname} resolves to a non-public address`) as NodeJS.ErrnoException;
      e.code = 'ENOTPUBLIC';
      return callback(e, all ? [] : '');
    }
    if (all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

export function requestHeaders(method: string): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json, */*;q=0.5' };
  if (BODY_METHODS.has(method)) headers['content-type'] = 'application/json';
  return headers;
}

/** "2026-10-21T19:02:51Z" */
export function isoSecond(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export interface ProbeOptions {
  /** Tests only: let a probe reach 127.0.0.1. */
  allowPrivate?: boolean;
  timeoutMs?: number;
}

/** Send the one request. Never throws: a failure comes back as `status: null` with the error. */
export function probe(target: Target, opts: ProbeOptions = {}): Promise<ProbeRecord> {
  const method = (target.method ?? 'GET').toUpperCase();
  const headers = requestHeaders(method);
  const body = BODY_METHODS.has(method) ? (target.body ?? '{}') : undefined;
  const started = Date.now();
  const rec: ProbeRecord = {
    url: target.url,
    method,
    sentAt: isoSecond(started),
    request: { headers: { ...headers }, ...(body !== undefined ? { body } : {}) },
    status: null,
  };
  const fail = (error: string): ProbeRecord => ({ ...rec, error, elapsedMs: Date.now() - started });

  let url: URL;
  try {
    url = new URL(target.url);
  } catch {
    return Promise.resolve(fail('invalid URL'));
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return Promise.resolve(fail(`refused: ${url.protocol} URL`));
  if (url.username || url.password) return Promise.resolve(fail('refused: credentials in URL'));
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (!opts.allowPrivate && isIP(literal) && !isPublicAddress(literal)) {
    return Promise.resolve(fail(`refused: ${literal} is not a public address`));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: ProbeRecord) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(r);
    };
    const options: RequestOptions = {
      method,
      headers: body !== undefined ? { ...headers, 'content-length': String(Buffer.byteLength(body)) } : headers,
      maxHeaderSize: MAX_HEADER_BYTES,
      agent: false,
      ...(opts.allowPrivate ? {} : { lookup: guardedLookup as unknown as RequestOptions['lookup'] }),
    };
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, (res: IncomingMessage) => {
      const out: Record<string, string> = {};
      let headerBytes = 0;
      for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
        const k = res.rawHeaders[i]!;
        const v = res.rawHeaders[i + 1]!;
        headerBytes += k.length + v.length + 4;
        const name = k.toLowerCase();
        const value = FULL_HEADERS.has(name) ? v : v.slice(0, 8192);
        out[name] = out[name] !== undefined ? `${out[name]}, ${value}` : value;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on('data', (chunk: Buffer) => {
        if (truncated) return;
        const room = MAX_BODY - size;
        if (chunk.length > room) {
          chunks.push(chunk.subarray(0, room));
          size = MAX_BODY;
          truncated = true;
          res.destroy();
          done();
        } else {
          chunks.push(chunk);
          size += chunk.length;
        }
      });
      const done = () =>
        finish({
          ...rec,
          status: res.statusCode ?? null,
          elapsedMs: Date.now() - started,
          headers: out,
          headerBytes,
          bodyText: Buffer.concat(chunks).toString('utf8'),
          ...(truncated ? { bodyTruncated: true } : {}),
        });
      res.on('end', done);
      res.on('error', () => done());
    });
    const deadline = setTimeout(() => {
      req.destroy(new Error(`no answer within ${(opts.timeoutMs ?? TIMEOUT_MS) / 1000} s`));
    }, opts.timeoutMs ?? TIMEOUT_MS);
    req.on('error', (e: NodeJS.ErrnoException) => finish(fail(`${e.code ?? e.name}: ${String(e.message).slice(0, 200)}`)));
    if (body !== undefined) req.write(body);
    req.end();
  });
}
