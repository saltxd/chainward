/**
 * The two jobs: `check` (a one-off report, for a seller's free first check) and
 * `daily` (the watch list, compared with the last run, a change report per subscriber
 * when an endpoint breaks or recovers). Reports go to files only; sending them is a
 * separate, human step.
 */
import { checkEndpoint, isBroken, tokenPairs, verdictOf, type EndpointCheck } from './classify.js';
import { diffEndpoint, endpointKey, type WatchEvent } from './diff.js';
import { discover, type Skip } from './discover.js';
import { Pacer, probe as sendProbe, type ProbeOptions, type ProbeRecord, type Target } from './probe.js';
import { renderChangeReport, renderCheckReport, type ChangeItem } from './report.js';
import type { Store, Subscriber } from './store.js';
import { ensureTokens, type RpcCall } from './tokens.js';

export interface RunOptions {
  store: Store;
  log?: (line: string) => void;
  /** Send a second request to an endpoint already requested today (only when the seller asks for a same-day re-check). */
  force?: boolean;
  /** Tests: replace the network. */
  probe?: (t: Target, o?: ProbeOptions) => Promise<ProbeRecord>;
  rpc?: RpcCall;
  pacer?: Pacer;
  now?: () => Date;
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** The polite request: today's answer is reused, so an endpoint gets at most one request a UTC day. */
function politeProber(opts: RunOptions, day: string) {
  const today = opts.store.probesOn(day);
  const pacer = opts.pacer ?? new Pacer();
  const send = opts.probe ?? sendProbe;
  const stats = { sent: 0, reused: 0 };
  const fn = async (t: Target): Promise<ProbeRecord> => {
    const method = (t.method ?? 'GET').toUpperCase();
    const key = `${method} ${t.url}`;
    const had = today.get(key);
    if (had && !opts.force) {
      stats.reused++;
      opts.log?.(`reuse  ${key} (already requested today at ${had.sentAt.slice(11, 19)} UTC)`);
      return had;
    }
    await pacer.wait();
    const rec = await send({ ...t, method });
    pacer.done();
    opts.store.recordProbe(day, rec);
    today.set(key, rec);
    stats.sent++;
    opts.log?.(`probe  ${key} -> ${rec.status ?? rec.error}`);
    return rec;
  };
  return { fn, stats };
}

async function classifyAll(opts: RunOptions, recs: ProbeRecord[]): Promise<EndpointCheck[]> {
  const tokens = opts.store.tokens();
  await ensureTokens(tokens, tokenPairs(recs), { rpcOverrides: opts.store.rpcOverrides(), rpc: opts.rpc, log: opts.log });
  opts.store.saveTokens(tokens);
  const out: EndpointCheck[] = [];
  for (const r of recs) out.push(await checkEndpoint(r, tokens));
  return out;
}

const slug = (s: string) => s.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9.-]+/g, '_').slice(0, 60);

export interface CheckResult {
  reportPath: string;
  jsonPath: string;
  report: string;
  checks: EndpointCheck[];
  requests: { sent: number; reused: number };
}

/** One-off check of hosts, discovery documents or endpoint URLs. */
export async function runCheck(inputs: string[], opts: RunOptions & { method?: string; body?: string }): Promise<CheckResult> {
  const store = opts.store;
  store.ensure();
  const now = (opts.now ?? (() => new Date()))();
  const day = utcDay(now);
  const prober = politeProber(opts, day);
  const targets: Target[] = [];
  const skipped: Skip[] = [];
  for (const input of inputs) {
    const d = await discover(input, prober.fn, opts.method ?? 'GET', opts.body);
    for (const t of d.endpoints) if (!targets.some((x) => x.url === t.url && x.method === t.method)) targets.push(t);
    skipped.push(...d.skipped);
    if (d.source) opts.log?.(`found  ${d.endpoints.length} endpoints in ${d.source}`);
  }
  const recs: ProbeRecord[] = [];
  for (const t of targets) recs.push(await prober.fn(t));
  const checks = await classifyAll(opts, recs);
  const tokens = store.tokens();
  const report = renderCheckReport({ target: inputs.join(', '), at: now.toISOString(), checks, notProbed: skipped }, tokens);
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '');
  const base = `checks/${stamp}-${slug(inputs[0] ?? 'check')}`;
  const reportPath = store.writeText(`${base}.txt`, report);
  const jsonPath = store.writeJson(`${base}.json`, { at: now.toISOString(), inputs, skipped, checks });
  return { reportPath, jsonPath, report, checks, requests: prober.stats };
}

export interface DailyResult {
  status: 'done' | 'locked' | 'empty';
  day: string;
  endpoints: number;
  requests: { sent: number; reused: number };
  events: WatchEvent[];
  reports: { subscriber: string; path: string }[];
  /** Changes that wrote no report on their own (no break or recovery for that subscriber). */
  notReported: { subscriber: string; event: WatchEvent }[];
  /** Discovery problems and listed endpoints not requested (templates, other hosts). */
  skipped: (Skip & { subscriber: string })[];
  summaryPath?: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** The daily run over the watch list. `dryRun` writes reports beside the run and leaves the state untouched. */
export async function runDaily(opts: RunOptions & { only?: string; dryRun?: boolean }): Promise<DailyResult> {
  const store = opts.store;
  const now = (opts.now ?? (() => new Date()))();
  const day = utcDay(now);
  const empty: DailyResult = { status: 'empty', day, endpoints: 0, requests: { sent: 0, reused: 0 }, events: [], reports: [], notReported: [], skipped: [] };
  const release = store.lock();
  if (!release) return { ...empty, status: 'locked' };
  try {
    const all = store.watchList().subscribers;
    const subs = all.filter((s) => !s.paused && (!opts.only || s.id === opts.only));
    if (!subs.length) return empty;
    const prober = politeProber(opts, day);

    // Who watches what: endpoints are requested once even when two subscribers share one.
    const watchers = new Map<string, { target: Target; subs: Set<string> }>();
    const add = (s: Subscriber, t: Target) => {
      const method = (t.method ?? 'GET').toUpperCase();
      const k = endpointKey(method, t.url);
      const w = watchers.get(k) ?? { target: { ...t, method }, subs: new Set<string>() };
      w.subs.add(s.id);
      watchers.set(k, w);
    };
    const skipped: DailyResult['skipped'] = [];
    for (const s of subs) {
      for (const e of s.endpoints ?? []) add(s, e);
      for (const doc of s.discovery ?? []) {
        const d = await discover(doc, prober.fn);
        for (const t of d.endpoints) add(s, t);
        for (const sk of d.skipped) {
          skipped.push({ subscriber: s.id, ...sk });
          opts.log?.(`skip   ${sk.url}: ${sk.reason}`);
        }
      }
    }
    const keys = [...watchers.keys()];
    const recs: ProbeRecord[] = [];
    for (const k of keys) recs.push(await prober.fn(watchers.get(k)!.target));
    const checks = await classifyAll(opts, recs);
    const tokens = store.tokens();

    const state = store.state();
    const byEndpoint = new Map<string, { check: EndpointCheck; events: WatchEvent[] }>();
    const events: WatchEvent[] = [];
    // Endpoints not requested this run (another subscriber under --only, a paused one) keep
    // their state; endpoints nobody lists any more are dropped.
    // A discovery document that failed today keeps its host's endpoints until it answers again.
    const listed = new Set([...keys, ...all.flatMap((s) => (s.endpoints ?? []).map((e) => endpointKey(e.method ?? 'GET', e.url)))]);
    const discoveryHosts = new Set(all.flatMap((s) => (s.discovery ?? []).map(hostOf)));
    const nextEndpoints: typeof state.endpoints = Object.fromEntries(
      Object.entries(state.endpoints).filter(([k, v]) => listed.has(k) || discoveryHosts.has(hostOf(v.url))),
    );
    checks.forEach((c, i) => {
      const k = keys[i]!;
      const { events: ev, next } = diffEndpoint(state.endpoints[k], c);
      nextEndpoints[k] = next;
      byEndpoint.set(k, { check: c, events: ev });
      events.push(...ev);
    });

    const reports: DailyResult['reports'] = [];
    const notReported: DailyResult['notReported'] = [];
    for (const s of subs) {
      const mine = keys.filter((k) => watchers.get(k)!.subs.has(s.id));
      const items: ChangeItem[] = mine.flatMap((k) => byEndpoint.get(k)!.events.map((event) => ({ event, check: byEndpoint.get(k)!.check })));
      if (!items.some((i) => i.event.kind === 'breaks' || i.event.kind === 'recovers')) {
        for (const i of items) notReported.push({ subscriber: s.id, event: i.event });
        continue;
      }
      const quiet = mine.filter((k) => byEndpoint.get(k)!.events.length === 0).map((k) => ({ k, u: nextEndpoints[k]!.units.standard }));
      const failing = quiet.filter((x) => x.u && isBroken(x.u.outcome)).map((x) => ({ key: x.k, since: x.u!.since, outcome: x.u!.outcome }));
      const passing = quiet.filter((x) => x.u && verdictOf(x.u.outcome) === 'passes').length;
      const text = renderChangeReport(
        {
          subscriber: { id: s.id, ...(s.name ? { name: s.name } : {}) },
          hosts: [...new Set(mine.map((k) => hostOf(watchers.get(k)!.target.url)))],
          at: now.toISOString(),
          items,
          steady: { passing, failing, notJudged: quiet.length - passing - failing.length },
        },
        tokens,
      );
      const file = opts.dryRun ? `runs/${day}/dry-run/${s.id}.txt` : `alerts/${day}/${s.id}.txt`;
      reports.push({ subscriber: s.id, path: store.writeText(file, text) });
    }

    if (!opts.dryRun) store.saveState({ version: 1, endpoints: nextEndpoints });
    const result: DailyResult = { status: 'done', day, endpoints: keys.length, requests: prober.stats, events, reports, notReported, skipped };
    result.summaryPath = store.writeJson(`runs/${day}/daily${opts.dryRun ? '-dry-run' : ''}.json`, {
      at: now.toISOString(),
      ...result,
      results: checks.map((c) => ({ endpoint: endpointKey(c.method, c.url), units: c.units.map((u) => ({ key: u.key, outcome: u.outcome, detail: u.detail })) })),
    });
    return result;
  } finally {
    release();
  }
}
