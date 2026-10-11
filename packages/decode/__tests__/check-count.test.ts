import { describe, expect, it } from 'vitest';
import { riskChecksFor } from '../src/risk-flags.js';
import { DEFAULT_RPC_WINDOW_DAYS } from '../src/rpc-fixtures.js';
// The web app does not bundle @chainward/decode, so it keeps the counts it shows
// ("Running 9 checks…") in an import-free constant. This keeps the two in step.
import { CHECKS_RUN, TRANSFER_WINDOW_DAYS } from '../../../apps/web/src/lib/checkCount';

describe('the check count the web app shows while a check runs', () => {
  it('matches the checks that really run on each chain', () => {
    expect(CHECKS_RUN.base).toBe(riskChecksFor('base').length);
    expect(CHECKS_RUN.bsc).toBe(riskChecksFor('bsc').length);
  });

  it('reads the transfer window each chain really reads ("Reading its last 14 days…")', () => {
    // Base reads Blockscout's 30-day horizon; BNB Chain scans public RPC logs.
    expect(TRANSFER_WINDOW_DAYS.base).toBe(30);
    expect(TRANSFER_WINDOW_DAYS.bsc).toBe(DEFAULT_RPC_WINDOW_DAYS);
  });
});
