import { afterEach, describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import { OFAC_LIST_FILES, isSanctioned, ofacList, ofacListUrl, refreshOfacList, resetOfacListForTests } from '../src/ofac.js';

// The sanctions screen is sold per call, so the list it reads must not wait for a
// redeploy. A refresh replaces the bundled snapshot only when every file came
// back clean, and never drops more than a quarter of the list at once.

const NEW_ADDR = `0x${'e'.repeat(40)}`;
const NOW = () => new Date('2026-10-13T06:00:00Z');

/** A fetch that serves each asset file from `files` (asset -> body or status). */
function fakeFetch(files: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const asset = OFAC_LIST_FILES.find((f) => url === ofacListUrl(f.asset))?.asset;
    const body = asset ? files[asset] : 404;
    if (typeof body === 'number') return new Response('not found', { status: body });
    return new Response(body ?? '', { status: 200 });
  }) as typeof fetch;
}

/** Today's snapshot spread over the ETH file, plus `extra`; the other files empty. */
function snapshotFiles(extra: string[] = [], keep = OFAC_SNAPSHOT.addresses.length): Record<string, string> {
  const files: Record<string, string> = Object.fromEntries(OFAC_LIST_FILES.map((f) => [f.asset, '']));
  files.ETH = [...OFAC_SNAPSHOT.addresses.slice(0, keep), ...extra].join('\n');
  return files;
}

afterEach(() => resetOfacListForTests());

describe('refreshOfacList', () => {
  it('replaces the snapshot with a clean download, so a newly listed address is caught', async () => {
    expect(isSanctioned(NEW_ADDR)).toBe(false);
    const result = await refreshOfacList({ fetch: fakeFetch(snapshotFiles([NEW_ADDR])), now: NOW });
    expect(result).toEqual({ ok: true, added: 1, removed: 0, total: OFAC_SNAPSHOT.addresses.length + 1 });
    expect(isSanctioned(NEW_ADDR.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(ofacList()).toEqual({
      source: OFAC_SNAPSHOT.source,
      fetched_at: '2026-10-13',
      addresses: OFAC_SNAPSHOT.addresses.length + 1,
    });
  });

  it('keeps the current list when any file fails to download', async () => {
    const files = { ...snapshotFiles([NEW_ADDR]), BSC: 404 };
    const result = await refreshOfacList({ fetch: fakeFetch(files), now: NOW });
    expect(result.ok).toBe(false);
    expect(isSanctioned(NEW_ADDR)).toBe(false);
    expect(ofacList().fetched_at).toBe(OFAC_SNAPSHOT.fetched_at);
  });

  it('keeps the current list when a file is not a list (an HTML error page served as 200)', async () => {
    const files = { ...snapshotFiles([NEW_ADDR]), ARB: '<!doctype html><title>Too many requests</title>' };
    const result = await refreshOfacList({ fetch: fakeFetch(files), now: NOW });
    expect(result.ok).toBe(false);
    expect(isSanctioned(NEW_ADDR)).toBe(false);
  });

  it('refuses an empty list', async () => {
    const empty = Object.fromEntries(OFAC_LIST_FILES.map((f) => [f.asset, '']));
    const result = await refreshOfacList({ fetch: fakeFetch(empty), now: NOW });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/empty/) });
    expect(ofacList().addresses).toBe(OFAC_SNAPSHOT.addresses.length);
  });

  it('refuses to drop more than a quarter of the list at once', async () => {
    const tenth = Math.floor(OFAC_SNAPSHOT.addresses.length / 10);
    const result = await refreshOfacList({ fetch: fakeFetch(snapshotFiles([], tenth)), now: NOW });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/drop/) });
    expect(isSanctioned(OFAC_SNAPSHOT.addresses.at(-1)!)).toBe(true);
  });

  it('accepts a small delisting', async () => {
    const keep = OFAC_SNAPSHOT.addresses.length - 2;
    const result = await refreshOfacList({ fetch: fakeFetch(snapshotFiles([], keep)), now: NOW });
    expect(result).toEqual({ ok: true, added: 0, removed: 2, total: keep });
    expect(isSanctioned(OFAC_SNAPSHOT.addresses.at(-1)!)).toBe(false);
  });
});

describe('startOfacRefresh', () => {
  it('refreshes after the first delay, logs the outcome, keeps the list on failure, and stops', async () => {
    const { vi } = await import('vitest');
    const { startOfacRefresh } = await import('../src/ofac.js');
    vi.useFakeTimers();
    const logs: Array<[string, string]> = [];
    const log = { info: (_o: object, m: string) => logs.push(['info', m]), warn: (_o: object, m: string) => logs.push(['warn', m]) };
    let serve: Record<string, string | number> = snapshotFiles([NEW_ADDR]);
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => fakeFetch(serve)(input, init));
    try {
      const timer = startOfacRefresh({ firstDelayMs: 1_000, intervalMs: 60_000, log });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(isSanctioned(NEW_ADDR)).toBe(true);
      expect(logs).toEqual([['info', 'OFAC list refreshed']]);

      serve = { ...snapshotFiles([NEW_ADDR]), USDT: 503 };
      await vi.advanceTimersByTimeAsync(60_000);
      expect(logs.at(-1)).toEqual(['warn', 'OFAC list refresh failed; keeping the current list']);
      expect(isSanctioned(NEW_ADDR)).toBe(true);

      timer.stop();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(logs).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
