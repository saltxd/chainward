import { baseBlockAt, baseBlocksBack, baseTimeOfBlock } from '@chainward/common';

/** Days of history a new agent's backfill reads. */
export const BACKFILL_WINDOW_DAYS = 30;
/** Days of an ACP wallet's transfers the wallet tracer reads. */
export const ACP_TRACE_WINDOW_DAYS = 30;
/** How far back the registry scout starts on its first run. */
export const REGISTRY_SCOUT_INITIAL_DAYS = 1;

/**
 * The Base block a look-back window of `days` starts at, counted from `head`.
 * Base's block time changed from 2 s to 200 ms on 2026-11-05, so a day is not a
 * fixed number of blocks: this walks the real schedule.
 */
export function baseLookbackStart(head: bigint, days: number): bigint {
  return BigInt(baseBlocksBack(Number(head), days * 86_400));
}

/** How often the registry scout runs. */
export const REGISTRY_SCOUT_INTERVAL_SEC = 6 * 3_600;
/** Blocks per eth_getLogs call: public RPCs refuse ranges much over this. */
export const REGISTRY_SCOUT_CHUNK_BLOCKS = 10_000n;

/**
 * The block ranges one registry scout run scans, oldest first, contiguous, each at most
 * REGISTRY_SCOUT_CHUNK_BLOCKS blocks, up to the head. A run covers twice the run interval in time (by the
 * Base block schedule, so 216,000 blocks on 200 ms blocks) so a short outage or late run catches up.
 */
export function registryScoutChunks(fromBlock: bigint, head: bigint): Array<{ from: bigint; to: bigint }> {
  const runEnd = BigInt(baseBlockAt(baseTimeOfBlock(Number(fromBlock)) + 2 * REGISTRY_SCOUT_INTERVAL_SEC));
  const end = runEnd < head ? runEnd : head;
  const chunks: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= end; from += REGISTRY_SCOUT_CHUNK_BLOCKS) {
    const to = from + REGISTRY_SCOUT_CHUNK_BLOCKS - 1n;
    chunks.push({ from, to: to < end ? to : end });
  }
  return chunks;
}
