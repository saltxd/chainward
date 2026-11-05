/**
 * How old is a ChainWard attestation? Compare the header timestamps of the
 * report's `asOfBlock` and the current head. Do not count blocks: Base's block
 * time changed from 2 s to 200 ms on 2026-11-05, so a day is no longer a fixed
 * number of blocks. Fetch both with viem's `client.getBlock({ blockNumber })`.
 */
const DAY_SECONDS = 86_400n;

/** Whole days between two block header timestamps (unix seconds). */
export function reportAgeDays(headTimestamp: bigint, reportTimestamp: bigint): number {
  return Number((headTimestamp - reportTimestamp) / DAY_SECONDS);
}

/** True when the report is more than `maxDays` days older than the head. */
export function reportIsOlderThan(headTimestamp: bigint, reportTimestamp: bigint, maxDays: number): boolean {
  return headTimestamp - reportTimestamp > BigInt(maxDays) * DAY_SECONDS;
}
