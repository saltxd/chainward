import { describe, expect, it } from 'vitest';
import { riskChecksFor } from '../src/risk-flags.js';
// The web app does not bundle @chainward/decode, so it keeps the counts it shows
// ("Running 9 checks…") in an import-free constant. This keeps the two in step.
import { CHECKS_RUN } from '../../../apps/web/src/lib/checkCount';

describe('the check count the web app shows while a check runs', () => {
  it('matches the checks that really run on each chain', () => {
    expect(CHECKS_RUN.base).toBe(riskChecksFor('base').length);
    expect(CHECKS_RUN.bsc).toBe(riskChecksFor('bsc').length);
  });
});
