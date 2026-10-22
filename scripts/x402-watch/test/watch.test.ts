import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pacer, type ProbeRecord, type Target } from '../src/probe.js';
import { Store } from '../src/store.js';
import { runCheck, runDaily } from '../src/watch.js';
import { fixture, tokens } from './helpers.js';

let home: string;
let store: Store;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'x402-watch-test-'));
  store = new Store(home);
  store.ensure();
  store.saveTokens(tokens());
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A fake network: each URL answers with the fixture named for it today. */
function network(today: Record<string, string>, iso: string) {
  const sent: Target[] = [];
  const probe = vi.fn(async (t: Target): Promise<ProbeRecord> => {
    sent.push(t);
    const rec = fixture(today[t.url]!);
    return { ...rec, url: t.url, method: t.method ?? 'GET', sentAt: iso };
  });
  return { probe, sent };
}

const noRpc = async () => {
  throw new Error('no RPC in tests');
};
const instant = () => new Pacer(0);
const A = 'https://api.example.com/v1/a';
const B = 'https://api.example.com/v1/b';

function watch(subscribers: unknown[]) {
  store.writeJson('watchlist.json', { subscribers });
}

describe('daily', () => {
  it('baselines, then writes a report only for the subscriber whose endpoint broke, then for its recovery', async () => {
    watch([
      { id: 's001', email: 'ops@example.com', endpoints: [{ url: A }, { url: B }] },
      { id: 's002', endpoints: [{ url: B }] },
    ]);
    const day = async (iso: string, today: Record<string, string>) => {
      const net = network(today, iso);
      const r = await runDaily({ store, probe: net.probe, rpc: noRpc, pacer: instant(), now: () => new Date(iso) });
      return { r, net };
    };

    const d1 = await day('2026-10-22T06:00:00Z', { [A]: 'valid-base-usdc', [B]: 'valid-base-usdc' });
    expect(d1.r).toMatchObject({ status: 'done', endpoints: 2, reports: [], events: [] });
    // B is watched by two subscribers but requested once.
    expect(d1.net.sent.map((t) => t.url)).toEqual([A, B]);

    const d2 = await day('2026-10-23T06:00:00Z', { [A]: 'v1-names-in-v2', [B]: 'valid-base-usdc' });
    expect(d2.r.reports.map((x) => x.subscriber)).toEqual(['s001']);
    const report = readFileSync(d2.r.reports[0]!.path, 'utf8');
    expect(d2.r.reports[0]!.path).toBe(join(home, 'alerts', '2026-10-23', 's001.txt'));
    expect(report).toContain('Subject: x402 watch: api.example.com, 1 endpoint broke');
    expect(report).toContain(`At 06:00 UTC our standard buyer requested GET ${A}. The 402 offered only 'base' under x402Version 2, so the buyer found no network it could match and stopped. Yesterday it passed. Fix: use the CAIP-2 id 'eip155:8453'.`);
    expect(report).toContain('Unchanged since the last run: 1 endpoint still passes.');
    expect(report).not.toContain('ops@example.com');

    const d3 = await day('2026-10-24T06:00:00Z', { [A]: 'v1-names-in-v2', [B]: 'valid-base-usdc' });
    expect(d3.r.reports).toEqual([]);

    const d4 = await day('2026-10-25T06:00:00Z', { [A]: 'valid-base-usdc', [B]: 'valid-base-usdc' });
    expect(d4.r.reports.map((x) => x.subscriber)).toEqual(['s001']);
    expect(readFileSync(d4.r.reports[0]!.path, 'utf8')).toContain('1 endpoint recovered');
    expect(readFileSync(d4.r.reports[0]!.path, 'utf8')).toContain('It had failed since Oct 23 (v1 network names in a v2 challenge).');
  });

  it('requests each endpoint at most once a UTC day, even across runs', async () => {
    watch([{ id: 's001', endpoints: [{ url: A }] }]);
    const iso = '2026-10-22T06:00:00Z';
    const first = network({ [A]: 'valid-base-usdc' }, iso);
    await runDaily({ store, probe: first.probe, rpc: noRpc, pacer: instant(), now: () => new Date(iso) });
    const again = network({ [A]: 'valid-base-usdc' }, iso);
    const r = await runDaily({ store, probe: again.probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-22T18:00:00Z') });
    expect(again.probe).not.toHaveBeenCalled();
    expect(r.requests).toEqual({ sent: 0, reused: 1 });
    // A check the same day reuses the watch's answer too.
    const c = await runCheck([A], { store, probe: again.probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-22T19:00:00Z') });
    expect(again.probe).not.toHaveBeenCalled();
    expect(c.requests).toEqual({ sent: 0, reused: 1 });
  });

  it('keeps the state untouched on a dry run and writes its reports beside the run', async () => {
    watch([{ id: 's001', endpoints: [{ url: A }] }]);
    await runDaily({ store, probe: network({ [A]: 'valid-base-usdc' }, '2026-10-22T06:00:00Z').probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-22T06:00:00Z') });
    const before = readFileSync(join(home, 'state.json'), 'utf8');
    const r = await runDaily({ store, dryRun: true, probe: network({ [A]: 'wrong-domain-base-usdc' }, '2026-10-23T06:00:00Z').probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-23T06:00:00Z') });
    expect(r.reports[0]!.path).toBe(join(home, 'runs', '2026-10-23', 'dry-run', 's001.txt'));
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(before);
    expect(existsSync(join(home, 'alerts'))).toBe(false);
  });

  it('records a change outside the judged classes without writing a report', async () => {
    watch([{ id: 's001', endpoints: [{ url: A }] }]);
    const run = (iso: string, name: string, rec?: (r: ProbeRecord) => ProbeRecord) => {
      const net = network({ [A]: name }, iso);
      const probe = rec ? vi.fn(async (t: Target) => rec(await net.probe(t))) : net.probe;
      return runDaily({ store, probe, rpc: noRpc, pacer: instant(), now: () => new Date(iso) });
    };
    await run('2026-10-22T06:00:00Z', 'valid-base-usdc');
    // Same endpoint, price raised to $5: a standard buyer refuses it (reported, not judged).
    const pricey = (r: ProbeRecord): ProbeRecord => {
      const h = JSON.parse(Buffer.from(r.headers!['payment-required']!, 'base64').toString());
      h.accepts[0].amount = '5000000';
      return { ...r, headers: { ...r.headers, 'payment-required': Buffer.from(JSON.stringify(h)).toString('base64') } };
    };
    const r = await run('2026-10-23T06:00:00Z', 'valid-base-usdc', pricey);
    expect(r.reports).toEqual([]);
    expect(r.notReported.map((n) => [n.event.kind, n.event.cur?.outcome])).toContainEqual(['changes', 'POLICY_OVER_1_USD_DEFAULT_CAP']);
    expect(JSON.parse(readFileSync(r.summaryPath!, 'utf8')).notReported).toHaveLength(r.notReported.length);
  });

  it('keeps the other subscribers’ state when one runs alone', async () => {
    watch([
      { id: 's001', endpoints: [{ url: A }] },
      { id: 's002', endpoints: [{ url: B }] },
    ]);
    const iso = '2026-10-22T06:00:00Z';
    await runDaily({ store, probe: network({ [A]: 'valid-base-usdc', [B]: 'valid-base-usdc' }, iso).probe, rpc: noRpc, pacer: instant(), now: () => new Date(iso) });
    const next = '2026-10-23T06:00:00Z';
    const r = await runDaily({ store, only: 's001', probe: network({ [A]: 'valid-base-usdc' }, next).probe, rpc: noRpc, pacer: instant(), now: () => new Date(next) });
    expect(r.endpoints).toBe(1);
    expect(Object.keys(JSON.parse(readFileSync(join(home, 'state.json'), 'utf8')).endpoints).sort()).toEqual([`GET ${A}`, `GET ${B}`]);
  });

  it('holds one run at a time', async () => {
    watch([{ id: 's001', endpoints: [{ url: A }] }]);
    const release = store.lock()!;
    const r = await runDaily({ store, probe: network({ [A]: 'valid-base-usdc' }, '2026-10-22T06:00:00Z').probe, rpc: noRpc, pacer: instant() });
    expect(r.status).toBe('locked');
    release();
  });

  it('rejects a watch list it cannot trust', async () => {
    watch([{ id: '../x', endpoints: [] }]);
    await expect(runDaily({ store, rpc: noRpc })).rejects.toThrow(/subscriber id/);
    watch([{ id: 's1', endpoints: [{ url: 'file:///etc/passwd' }] }]);
    await expect(runDaily({ store, rpc: noRpc })).rejects.toThrow(/must be http/);
  });

  it('keeps its files private to the user', async () => {
    watch([{ id: 's001', endpoints: [{ url: A }] }]);
    await runDaily({ store, probe: network({ [A]: 'valid-base-usdc' }, '2026-10-22T06:00:00Z').probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-22T06:00:00Z') });
    expect(statSync(join(home, 'state.json')).mode & 0o077).toBe(0);
    expect(statSync(join(home, 'runs', '2026-10-22', 'probes.jsonl')).mode & 0o077).toBe(0);
  });
});

describe('check', () => {
  it('writes the free first check to a file and returns it', async () => {
    const net = network({ [A]: 'second-chain-wrong-domain' }, '2026-10-22T09:00:00Z');
    const r = await runCheck([A], { store, probe: net.probe, rpc: noRpc, pacer: instant(), now: () => new Date('2026-10-22T09:00:00Z') });
    expect(r.reportPath).toBe(join(home, 'checks', '20261022T0900-api.example.com_v1_a.txt'));
    expect(readFileSync(r.reportPath, 'utf8')).toBe(r.report);
    expect(r.report).toContain(`1. GET ${A}: passes; 1 offer fails on its own`);
    expect(JSON.parse(readFileSync(r.jsonPath, 'utf8')).checks).toHaveLength(1);
  });
});
