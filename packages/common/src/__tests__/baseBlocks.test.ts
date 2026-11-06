import { describe, expect, it } from 'vitest';
import {
  BASE_FAST_BLOCK_MS,
  BASE_SWITCH_BLOCK,
  BASE_SWITCH_TIMESTAMP,
  baseBlockAt,
  baseBlockSecondsAt,
  baseBlocksBack,
  baseSecondsBetween,
  baseTimeOfBlock,
} from '../utils/baseBlocks.js';

const DAY = 86_400;

describe('Base block schedule', () => {
  it('is exact at the boundary', () => {
    expect(BASE_SWITCH_BLOCK).toBe(53_556_127);
    expect(baseTimeOfBlock(53_556_126)).toBe(1793901599); // 2026-11-05 17:59:59 UTC
    expect(baseTimeOfBlock(53_556_127)).toBe(1793901601); // 18:00:01 UTC
    expect(baseTimeOfBlock(53_556_137)).toBe(1793901603); // measured 18:00:03
    expect(baseTimeOfBlock(53_600_000)).toBeCloseTo(1793910375.6, 6); // timestampMs 1793910375600
    expect(new Date(baseTimeOfBlock(53_556_126) * 1000).toISOString()).toBe('2026-11-05T17:59:59.000Z');
    expect(new Date(baseTimeOfBlock(53_556_127) * 1000).toISOString()).toBe('2026-11-05T18:00:01.000Z');
  });

  it('is 2 s per block before and 0.2 s per block from the switch', () => {
    expect(baseTimeOfBlock(53_556_126) - baseTimeOfBlock(53_556_125)).toBe(2);
    expect(baseTimeOfBlock(53_556_128) - baseTimeOfBlock(53_556_127)).toBeCloseTo(0.2, 6);
    expect(baseBlockSecondsAt(53_556_126)).toBe(2);
    expect(baseBlockSecondsAt(53_556_127)).toBe(BASE_FAST_BLOCK_MS / 1000);
  });

  it('maps a time to the last block at or before it', () => {
    expect(baseBlockAt(1793901599)).toBe(53_556_126);
    expect(baseBlockAt(1793901600)).toBe(53_556_126); // inside the 2 s gap
    expect(baseBlockAt(BASE_SWITCH_TIMESTAMP)).toBe(53_556_127);
    expect(baseBlockAt(1793901603)).toBe(53_556_137);
    expect(baseBlockAt(1793910375.6)).toBe(53_600_000);
    expect(baseBlockAt(1793901598)).toBe(53_556_125);
  });

  it('round-trips blocks on both sides of the switch', () => {
    for (const b of [1, 40_000_000, 53_556_125, 53_556_126, 53_556_127, 53_556_128, 53_600_000, 60_000_000]) {
      expect(baseBlockAt(baseTimeOfBlock(b))).toBe(b);
    }
  });

  it('counts a day as 432,000 blocks after the switch and 43,200 before it', () => {
    expect(baseBlocksBack(60_000_000, DAY)).toBe(60_000_000 - 432_000);
    expect(baseBlocksBack(53_000_000, DAY)).toBe(53_000_000 - 43_200);
  });

  it('walks a window that crosses the switch piecewise', () => {
    // head is 1 h after the switch: 18,000 fast blocks cover the first hour, the other 23 h are slow blocks
    const head = BASE_SWITCH_BLOCK + 18_000;
    const from = baseBlocksBack(head, DAY);
    expect(from).toBe(BASE_SWITCH_BLOCK - (DAY - 3_600) / 2);
    expect(baseSecondsBetween(from, head)).toBeCloseTo(DAY, 6);
    // one fast-rate average would reach 432,000 blocks back, far past the switch
    expect(from).toBeGreaterThan(head - 432_000);
  });

  it('puts a 30-day window at the block that is truly 30 days back', () => {
    const head = 60_000_000;
    const from = baseBlocksBack(head, 30 * DAY);
    const span = baseTimeOfBlock(head) - baseTimeOfBlock(from);
    expect(span).toBeGreaterThanOrEqual(30 * DAY);
    expect(span - 30 * DAY).toBeLessThan(2); // the start lands in the 2 s era: one block of slack
  });

  it('clamps at block 0 and measures spans in seconds', () => {
    expect(baseBlocksBack(100, DAY)).toBe(0);
    expect(baseSecondsBetween(53_556_126, 53_556_127)).toBe(2);
    expect(baseSecondsBetween(53_556_127, 53_556_137)).toBeCloseTo(2, 6);
    expect(baseSecondsBetween(10, 5)).toBe(-baseSecondsBetween(5, 10));
  });
});
