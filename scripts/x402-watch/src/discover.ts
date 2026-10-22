/**
 * From what a seller sends us (a host, its /.well-known/x402, its openapi.json, or one
 * endpoint URL) to the list of endpoints to request. Discovery documents are fetched
 * with the same polite probe as endpoints. Only endpoints on the document's own host
 * are taken; path templates and other hosts are listed as skipped, never guessed at.
 */
import { isObject, type Json } from './challenge.js';
import type { ProbeRecord, Target } from './probe.js';

export const MAX_ENDPOINTS = 200;
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export interface Skip {
  url: string;
  reason: string;
}

export interface Discovery {
  endpoints: Target[];
  skipped: Skip[];
  /** The documents requested, in order (each one counts as a request to the host). */
  docs: ProbeRecord[];
  /** The document the endpoints came from, if any. */
  source: string | null;
}

export type Fetcher = (target: Target) => Promise<ProbeRecord>;

/** Normalise user input to a URL: bare hosts get https. */
export function toUrl(input: string): URL {
  const s = input.trim();
  return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
}

export function isDiscoveryUrl(u: URL): boolean {
  return u.pathname === '/' || u.pathname === '' || /\/\.well-known\/x402\/?$/.test(u.pathname) || /openapi[^/]*\.json$/i.test(u.pathname);
}

const templated = (path: string) => /\{[^}]*\}|\/:[A-Za-z_]/.test(path) || /%7B/i.test(path);

function addEndpoint(out: Discovery, docHost: string, url: string, method: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    out.skipped.push({ url, reason: 'not a URL' });
    return;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return void out.skipped.push({ url, reason: `not http(s)` });
  if (u.hostname.toLowerCase() !== docHost) return void out.skipped.push({ url, reason: `on another host (${u.hostname}): check it on its own` });
  if (templated(decodeURI(u.pathname))) return void out.skipped.push({ url, reason: 'a path template: send us an example URL' });
  const m = method.toUpperCase();
  if (out.endpoints.some((e) => e.url === u.href && (e.method ?? 'GET') === m)) return;
  if (out.endpoints.length >= MAX_ENDPOINTS) return void out.skipped.push({ url, reason: `over the ${MAX_ENDPOINTS}-endpoint cap` });
  out.endpoints.push({ url: u.href, method: m });
}

/** Endpoints listed in a /.well-known/x402 document: `resources` as URLs or objects. */
export function fromWellKnown(doc: Record<string, Json>, docUrl: URL, out: Discovery): void {
  const list = [doc.resources, doc.endpoints, doc.items].find(Array.isArray) as Json[] | undefined;
  for (const r of list ?? []) {
    if (typeof r === 'string') addEndpoint(out, docUrl.hostname.toLowerCase(), new URL(r, docUrl).href, 'GET');
    else if (isObject(r)) {
      const url = [r.resource, r.url, r.endpoint].find((v) => typeof v === 'string') as string | undefined;
      const method = typeof r.method === 'string' ? r.method : 'GET';
      if (url) addEndpoint(out, docUrl.hostname.toLowerCase(), new URL(url, docUrl).href, method);
    }
  }
}

function paidOperation(op: Record<string, Json>): boolean {
  if (Object.keys(op).some((k) => /^x-(payment|x?402|price)/i.test(k))) return true;
  return isObject(op.responses) && '402' in op.responses;
}

/** Endpoints in an OpenAPI document: operations marked paid (a 402 response or an x-payment extension); all of them if none is marked. */
export function fromOpenApi(doc: Record<string, Json>, docUrl: URL, out: Discovery): void {
  const servers = Array.isArray(doc.servers) ? doc.servers.filter(isObject) : [];
  const serverUrl = typeof servers[0]?.url === 'string' ? servers[0].url : '/';
  const base = new URL(serverUrl, docUrl);
  const prefix = base.pathname.replace(/\/$/, '');
  const ops: [string, string, Record<string, Json>][] = [];
  for (const [path, item] of Object.entries(isObject(doc.paths) ? doc.paths : {})) {
    if (!isObject(item)) continue;
    for (const [m, op] of Object.entries(item)) if (METHODS.has(m) && isObject(op)) ops.push([path, m, op]);
  }
  const paid = ops.filter(([, , op]) => paidOperation(op));
  const take = paid.length ? paid : ops;
  if (!paid.length && ops.length) out.skipped.push({ url: docUrl.href, reason: 'no operation is marked paid (no 402 response or x-payment field): trying every one' });
  for (const [path, m] of take) addEndpoint(out, docUrl.hostname.toLowerCase(), `${base.origin}${prefix}${path}`, m);
}

function parseDoc(rec: ProbeRecord): Record<string, Json> | null {
  if (rec.status !== 200 || !rec.bodyText) return null;
  try {
    const j = JSON.parse(rec.bodyText) as Json;
    return isObject(j) ? j : null;
  } catch {
    return null;
  }
}

/** Resolve one input. A host tries /.well-known/x402, then /openapi.json; an endpoint URL is taken as is. */
export async function discover(input: string, fetchDoc: Fetcher, method = 'GET', body?: string): Promise<Discovery> {
  const out: Discovery = { endpoints: [], skipped: [], docs: [], source: null };
  let u: URL;
  try {
    u = toUrl(input);
  } catch {
    out.skipped.push({ url: input, reason: 'not a URL or host' });
    return out;
  }
  if (!isDiscoveryUrl(u)) {
    out.endpoints.push({ url: u.href, method: method.toUpperCase(), ...(body !== undefined ? { body } : {}) });
    return out;
  }
  const candidates = u.pathname === '/' || u.pathname === '' ? [new URL('/.well-known/x402', u), new URL('/openapi.json', u)] : [u];
  for (const docUrl of candidates) {
    const rec = await fetchDoc({ url: docUrl.href, method: 'GET' });
    out.docs.push(rec);
    const doc = parseDoc(rec);
    if (!doc) {
      out.skipped.push({ url: docUrl.href, reason: rec.status === null ? `no answer (${rec.error ?? ''})` : `answered ${rec.status}, not a JSON document` });
      continue;
    }
    if ('openapi' in doc || 'swagger' in doc) fromOpenApi(doc, docUrl, out);
    else fromWellKnown(doc, docUrl, out);
    out.source = docUrl.href;
    break;
  }
  return out;
}
