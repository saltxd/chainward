import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_MAX_HEAD_LAG_SEC,
  deriveNodeHead,
  isNodeHeadFresh,
  getMaxHeadLagSec,
  fetchNodeHead,
  assessNodeFreshness,
  _resetHeadCache,
} from '../providers/freshness.js';

const hex = (n: number) => '0x' + n.toString(16);

/** A raw eth_getBlockByNumber("latest") header at a given block/timestamp. */
function head(number: number, timestampSec: number) {
  return { number: hex(number), timestamp: hex(timestampSec) };
}

/** Mock fetch returning a JSON-RPC head result. */
function mockHeadFetch(number: number, timestampSec: number) {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: head(number, timestampSec) })));
}

describe('deriveNodeHead', () => {
  it('parses hex fields and computes a non-negative age', () => {
    const nowMs = 1_000_000 * 1000; // now = 1_000_000s
    const h = deriveNodeHead(head(48_000_000, 999_400), nowMs);
    expect(h.headNumber).toBe(48_000_000);
    expect(h.headTimestamp).toBe(999_400);
    expect(h.ageSeconds).toBe(600);
  });

  it('clamps age to 0 for a head that reads ahead of the local clock', () => {
    const h = deriveNodeHead(head(1, 2_000), 1_000 * 1000); // now = 1000s, head at 2000s
    expect(h.ageSeconds).toBe(0);
  });

  it('throws on a missing or unparseable head', () => {
    expect(() => deriveNodeHead(null, Date.now())).toThrow(/missing head block/);
    expect(() => deriveNodeHead({ number: '0x1' } as any, Date.now())).toThrow(/missing head block/);
    expect(() => deriveNodeHead({ number: 'zzz', timestamp: 'zzz' }, Date.now())).toThrow(/unparseable/);
  });
});

describe('isNodeHeadFresh', () => {
  it('is fresh at or under the threshold, stale above it', () => {
    expect(isNodeHeadFresh({ headNumber: 1, headTimestamp: 0, ageSeconds: 599 }, 600)).toBe(true);
    expect(isNodeHeadFresh({ headNumber: 1, headTimestamp: 0, ageSeconds: 600 }, 600)).toBe(true);
    expect(isNodeHeadFresh({ headNumber: 1, headTimestamp: 0, ageSeconds: 601 }, 600)).toBe(false);
  });

  it('flags the production repro (13.5 days behind) as stale under the default', () => {
    const thirteenAndHalfDays = Math.round(13.5 * 24 * 3600);
    expect(isNodeHeadFresh({ headNumber: 47_806_437, headTimestamp: 0, ageSeconds: thirteenAndHalfDays }))
      .toBe(false);
  });
});

describe('getMaxHeadLagSec', () => {
  it('defaults to 600 when unset or blank', () => {
    expect(getMaxHeadLagSec({})).toBe(DEFAULT_MAX_HEAD_LAG_SEC);
    expect(getMaxHeadLagSec({ NODE_MAX_HEAD_LAG_SEC: '' })).toBe(DEFAULT_MAX_HEAD_LAG_SEC);
  });

  it('reads a valid positive override', () => {
    expect(getMaxHeadLagSec({ NODE_MAX_HEAD_LAG_SEC: '120' })).toBe(120);
  });

  it('falls back to the default for invalid / non-positive values (never disables the guard)', () => {
    expect(getMaxHeadLagSec({ NODE_MAX_HEAD_LAG_SEC: 'abc' })).toBe(DEFAULT_MAX_HEAD_LAG_SEC);
    expect(getMaxHeadLagSec({ NODE_MAX_HEAD_LAG_SEC: '0' })).toBe(DEFAULT_MAX_HEAD_LAG_SEC);
    expect(getMaxHeadLagSec({ NODE_MAX_HEAD_LAG_SEC: '-5' })).toBe(DEFAULT_MAX_HEAD_LAG_SEC);
  });
});

describe('fetchNodeHead', () => {
  beforeEach(() => _resetHeadCache());
  afterEach(() => _resetHeadCache());

  it('probes eth_getBlockByNumber("latest", false) exactly once and parses the head', async () => {
    const nowMs = 1_000_000 * 1000;
    const fetchImpl = mockHeadFetch(48_000_000, 999_500);
    const h = await fetchNodeHead('http://node', { fetchImpl: fetchImpl as any, now: () => nowMs });

    expect(h).toEqual({ headNumber: 48_000_000, headTimestamp: 999_500, ageSeconds: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body as string);
    expect(body.method).toBe('eth_getBlockByNumber');
    expect(body.params).toEqual(['latest', false]);
  });

  it('serves a cached head within the TTL (no second probe) and re-ages it against the clock', async () => {
    let nowMs = 1_000_000 * 1000;
    const fetchImpl = mockHeadFetch(48_000_000, 999_500); // age 500 at first probe
    const opts = { fetchImpl: fetchImpl as any, now: () => nowMs, cacheTtlMs: 20_000 };

    const first = await fetchNodeHead('http://node', opts);
    expect(first.ageSeconds).toBe(500);

    nowMs += 10_000; // +10s, still inside the 20s TTL
    const second = await fetchNodeHead('http://node', opts);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // still cached
    expect(second.ageSeconds).toBe(510); // re-aged, not frozen at 500
  });

  it('re-probes after the TTL expires', async () => {
    let nowMs = 1_000_000 * 1000;
    const fetchImpl = mockHeadFetch(48_000_000, 999_500);
    const opts = { fetchImpl: fetchImpl as any, now: () => nowMs, cacheTtlMs: 20_000 };

    await fetchNodeHead('http://node', opts);
    nowMs += 25_000; // past the TTL
    await fetchNodeHead('http://node', opts);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches per-URL (distinct nodes probed independently)', async () => {
    const nowMs = 1_000_000 * 1000;
    const fetchImpl = mockHeadFetch(1, 999_999);
    await fetchNodeHead('http://a', { fetchImpl: fetchImpl as any, now: () => nowMs });
    await fetchNodeHead('http://b', { fetchImpl: fetchImpl as any, now: () => nowMs });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-2xx or JSON-RPC error response', async () => {
    const errStatus = vi.fn(async () => new Response('nope', { status: 503 }));
    await expect(fetchNodeHead('http://node', { fetchImpl: errStatus as any })).rejects.toThrow(/HTTP 503/);

    const rpcErr = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'boom' } })));
    await expect(fetchNodeHead('http://node2', { fetchImpl: rpcErr as any })).rejects.toThrow(/boom/);
  });
});

describe('assessNodeFreshness', () => {
  beforeEach(() => _resetHeadCache());
  afterEach(() => _resetHeadCache());

  it('marks a fresh node fresh', async () => {
    const nowMs = 1_000_000 * 1000;
    const fetchImpl = mockHeadFetch(48_000_000, 999_700); // age 300
    const r = await assessNodeFreshness('http://node', { fetchImpl: fetchImpl as any, now: () => nowMs, maxLagSec: 600 });
    expect(r.fresh).toBe(true);
    expect(r.ageSeconds).toBe(300);
    expect(r.maxLagSec).toBe(600);
  });

  it('marks a stalled-but-answering node UNFIT (the production bug)', async () => {
    const nowMs = 2_000_000 * 1000;
    const headTs = Math.floor(nowMs / 1000 - 13.5 * 24 * 3600); // 13.5 days behind
    const fetchImpl = mockHeadFetch(47_806_437, headTs);
    const r = await assessNodeFreshness('http://node', { fetchImpl: fetchImpl as any, now: () => nowMs, maxLagSec: 600 });
    expect(r.fresh).toBe(false);
    expect(r.headNumber).toBe(47_806_437);
    expect(r.ageSeconds).toBeGreaterThan(600);
  });
});
