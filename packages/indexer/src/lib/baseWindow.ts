import { baseBlocksBack } from '@chainward/common';

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
