/**
 * Everything the job keeps lives outside the repo, in one private directory
 * (default ~/.x402-watch, or X402_WATCH_HOME, or --home):
 *
 *   watchlist.json             subscribers and their endpoints (private: hosts, emails)
 *   state.json                 the last outcome per endpoint and buyer
 *   tokens.json                token facts read from public RPCs
 *   rpc.json                   optional per-chain RPC overrides (may carry keys)
 *   runs/<day>/probes.jsonl    every request made that UTC day, with what came back
 *   runs/<day>/daily.json      the day's results and events
 *   alerts/<day>/<id>.txt      change reports, one per subscriber with news
 *   checks/<stamp>-<target>.txt  one-off check reports
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EndpointState } from './diff.js';
import type { ProbeRecord, Target } from './probe.js';
import type { TokenBook } from './tokens.js';

export interface WatchEndpoint extends Target {
  url: string;
}

export interface Subscriber {
  /** Short id for file names: letters, digits, - and _. */
  id: string;
  /** For the subject line. */
  name?: string;
  /** Where the report goes. The job never sends anything; this is for the person who does. */
  email?: string;
  paused?: boolean;
  endpoints?: WatchEndpoint[];
  /** /.well-known/x402 or openapi.json URLs, re-read once a day for new routes. */
  discovery?: string[];
}

export interface WatchList {
  subscribers: Subscriber[];
}

export interface WatchState {
  version: 1;
  endpoints: Record<string, EndpointState>;
}

export function defaultHome(): string {
  return process.env.X402_WATCH_HOME || join(homedir(), '.x402-watch');
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export class Store {
  constructor(readonly home: string) {}

  ensure(): void {
    mkdirSync(this.home, { recursive: true, mode: 0o700 });
  }

  path(...parts: string[]): string {
    return join(this.home, ...parts);
  }

  private readJson<T>(file: string, fallback: T): T {
    const p = this.path(file);
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  }

  /** Write via a temp file and rename, so a crash never leaves half a state file. */
  writeJson(file: string, value: unknown): string {
    const p = this.path(file);
    mkdirSync(join(p, '..'), { recursive: true, mode: 0o700 });
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`, { mode: 0o600 });
    renameSync(tmp, p);
    return p;
  }

  writeText(file: string, text: string): string {
    const p = this.path(file);
    mkdirSync(join(p, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(p, text, { mode: 0o600 });
    return p;
  }

  watchList(): WatchList {
    const list = this.readJson<WatchList>('watchlist.json', { subscribers: [] });
    if (!Array.isArray(list.subscribers)) throw new Error('watchlist.json: "subscribers" must be a list');
    const ids = new Set<string>();
    for (const s of list.subscribers) {
      if (!ID.test(s.id ?? '')) throw new Error(`watchlist.json: subscriber id ${JSON.stringify(s.id)} must be 1-64 letters, digits, - or _`);
      if (ids.has(s.id)) throw new Error(`watchlist.json: duplicate subscriber id ${s.id}`);
      ids.add(s.id);
      for (const e of s.endpoints ?? []) {
        if (typeof e.url !== 'string' || !/^https?:\/\//.test(e.url)) throw new Error(`watchlist.json: ${s.id}: endpoint url ${JSON.stringify(e.url)} must be http(s)`);
      }
    }
    return list;
  }

  state(): WatchState {
    return this.readJson<WatchState>('state.json', { version: 1, endpoints: {} });
  }

  saveState(s: WatchState): void {
    this.writeJson('state.json', s);
  }

  tokens(): TokenBook {
    return this.readJson<TokenBook>('tokens.json', {});
  }

  saveTokens(t: TokenBook): void {
    this.writeJson('tokens.json', t);
  }

  rpcOverrides(): Record<string, string> {
    return this.readJson<Record<string, string>>('rpc.json', {});
  }

  /** Requests already made this UTC day, by "METHOD url": the one-request-a-day rule's memory. */
  probesOn(day: string): Map<string, ProbeRecord> {
    const p = this.path('runs', day, 'probes.jsonl');
    const out = new Map<string, ProbeRecord>();
    if (!existsSync(p)) return out;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as ProbeRecord;
      out.set(`${r.method} ${r.url}`, r);
    }
    return out;
  }

  recordProbe(day: string, rec: ProbeRecord): void {
    const p = this.path('runs', day, 'probes.jsonl');
    mkdirSync(join(p, '..'), { recursive: true, mode: 0o700 });
    appendFileSync(p, `${JSON.stringify(rec)}\n`, { mode: 0o600 });
  }

  /** One daily run at a time. Returns a release function, or null when another run holds the lock. */
  lock(name = 'daily.lock', staleMs = 6 * 3600 * 1000): (() => void) | null {
    this.ensure();
    const p = this.path(name);
    if (existsSync(p)) {
      try {
        const held = JSON.parse(readFileSync(p, 'utf8')) as { pid: number; at: string };
        let alive = false;
        try {
          process.kill(held.pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
        if (alive && Date.now() - Date.parse(held.at) < staleMs) return null;
      } catch {
        // Unreadable lock: take it over.
      }
      rmSync(p, { force: true });
    }
    const fd = openSync(p, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    closeSync(fd);
    return () => rmSync(p, { force: true });
  }
}
