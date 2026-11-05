import { describe, expect, it } from 'vitest';
import { BASE_SWITCH_BLOCK, baseTimeOfBlock } from '../utils/baseBlocks.js';
import { reportAgeDays, reportIsOlderThan } from '../../../../examples/report-age.js';

// The examples (check-counterparty, x402-guard) age an attestation by the header
// timestamps of the report's block and the head, never by a blocks-per-day constant:
// Base's block time changed from 2 s to 200 ms on 2026-11-05.

const DAY = 86_400n;
const ts = (block: number) => BigInt(Math.round(baseTimeOfBlock(block)));

describe('example report age', () => {
  it('reads a report from 432,000 blocks ago (1 day of 200 ms blocks) as 1 day old', () => {
    const head = 60_000_000;
    expect(reportAgeDays(ts(head), ts(head - 432_000))).toBe(1);
  });

  it('reads a report from 43,200 blocks ago as 2.4 hours old, not a day', () => {
    const head = 60_000_000;
    expect(reportAgeDays(ts(head), ts(head - 43_200))).toBe(0);
  });

  it('reads a report across the switch by real time', () => {
    const head = BASE_SWITCH_BLOCK + 18_000; // 1 h after the switch
    const asOf = BASE_SWITCH_BLOCK - 41_400; // 23 h of 2 s blocks before it
    expect(reportAgeDays(ts(head), ts(asOf))).toBe(1);
  });

  it('marks a report stale once it is older than the allowed days', () => {
    const head = 70_000_000; // 38 days of 200 ms blocks after the switch
    expect(reportIsOlderThan(ts(head), ts(head - 30 * 432_000), 30)).toBe(false); // exactly 30 days
    expect(reportIsOlderThan(ts(head), ts(head - 30 * 432_000 - 5), 30)).toBe(true);
    expect(reportIsOlderThan(ts(head), ts(head) - 29n * DAY, 30)).toBe(false);
  });
});
