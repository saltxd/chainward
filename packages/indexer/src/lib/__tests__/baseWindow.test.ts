import { describe, expect, it } from 'vitest';
import { baseTimeOfBlock } from '@chainward/common';
import { ACP_TRACE_WINDOW_DAYS, BACKFILL_WINDOW_DAYS, REGISTRY_SCOUT_INITIAL_DAYS, baseLookbackStart } from '../baseWindow.js';

const DAY = 86_400;
const HEAD = 60_000_000n; // ~15 days of 200 ms blocks after the switch, 2 s blocks before

function spanSeconds(from: bigint, head: bigint): number {
  return baseTimeOfBlock(Number(head)) - baseTimeOfBlock(Number(from));
}

describe('baseLookbackStart', () => {
  it('starts a 30-day window at the block that is truly 30 days back', () => {
    const span = spanSeconds(baseLookbackStart(HEAD, 30), HEAD);
    expect(span).toBeGreaterThanOrEqual(30 * DAY);
    expect(span - 30 * DAY).toBeLessThan(2);
  });

  it('is 432,000 blocks for a day of 200 ms blocks', () => {
    expect(baseLookbackStart(HEAD, 1)).toBe(HEAD - 432_000n);
  });

  it('never goes below block 0', () => {
    expect(baseLookbackStart(1_000n, 30)).toBe(0n);
  });

  it('gives each indexer window its length', () => {
    expect(BACKFILL_WINDOW_DAYS).toBe(30);
    expect(ACP_TRACE_WINDOW_DAYS).toBe(30);
    expect(REGISTRY_SCOUT_INITIAL_DAYS).toBe(1);
    expect(baseLookbackStart(HEAD, REGISTRY_SCOUT_INITIAL_DAYS)).toBe(HEAD - 432_000n);
    expect(spanSeconds(baseLookbackStart(HEAD, BACKFILL_WINDOW_DAYS), HEAD)).toBeGreaterThanOrEqual(30 * DAY);
  });
});
