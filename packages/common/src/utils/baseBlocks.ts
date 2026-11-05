/**
 * Base block time. Base made a block every 2 s through block 53,556,126
 * (2026-11-05 17:59:59 UTC) and one every 200 ms from block 53,556,127
 * (header timestamp 1793901601). A day is 43,200 blocks before the switch and
 * 432,000 after, so a look-back window that reaches across it needs both rates.
 * These helpers walk that two-piece schedule; never convert Base days to blocks
 * with a single constant or average.
 *
 * Pure and dependency-free. Where a real header timestamp is at hand, prefer it.
 */

/** First block produced on the 200 ms schedule. */
export const BASE_SWITCH_BLOCK = 53_556_127;
/** Header timestamp (unix seconds) of the switch block. */
export const BASE_SWITCH_TIMESTAMP = 1_793_901_601;
export const BASE_SLOW_BLOCK_MS = 2_000;
export const BASE_FAST_BLOCK_MS = 200;

const SWITCH_MS = BASE_SWITCH_TIMESTAMP * 1000;

/** Seconds per block on the schedule in force at `block`: 2 before the switch block, 0.2 from it (the switch block's own gap from its parent is 2 s). */
export function baseBlockSecondsAt(block: number): number {
  return (block < BASE_SWITCH_BLOCK ? BASE_SLOW_BLOCK_MS : BASE_FAST_BLOCK_MS) / 1000;
}

function timeMsOfBlock(block: number): number {
  return block < BASE_SWITCH_BLOCK
    ? SWITCH_MS - (BASE_SWITCH_BLOCK - block) * BASE_SLOW_BLOCK_MS
    : SWITCH_MS + (block - BASE_SWITCH_BLOCK) * BASE_FAST_BLOCK_MS;
}

/** Scheduled unix timestamp (seconds, fractional after the switch) of a Base block. */
export function baseTimeOfBlock(block: number): number {
  return timeMsOfBlock(block) / 1000;
}

/** The last Base block produced at or before this unix time (seconds). */
export function baseBlockAt(unixSeconds: number): number {
  const ms = Math.round(unixSeconds * 1000);
  if (ms >= SWITCH_MS) return BASE_SWITCH_BLOCK + Math.floor((ms - SWITCH_MS) / BASE_FAST_BLOCK_MS);
  return BASE_SWITCH_BLOCK - Math.ceil((SWITCH_MS - ms) / BASE_SLOW_BLOCK_MS);
}

/** The block `seconds` before `head`, at the schedule's rate on each side of the switch. Never below 0. */
export function baseBlocksBack(head: number, seconds: number): number {
  return Math.max(0, baseBlockAt(baseTimeOfBlock(head) - seconds));
}

/** Seconds between two Base blocks (negative when `to` is older than `from`). */
export function baseSecondsBetween(from: number, to: number): number {
  return (timeMsOfBlock(to) - timeMsOfBlock(from)) / 1000;
}
