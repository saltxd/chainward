// packages/indexer/src/scout/__tests__/ping.test.ts
import { describe, it, expect } from 'vitest';
import { renderCandidate, renderHeartbeat, type Candidate } from '../ping.js';

const cand: Candidate = {
  name: 'Wasabot',
  walletAddress: '0xAbC0000000000000000000000000000000000001',
  proof: '$81.0M aGDP vs no on-chain revenue — unmeasurable gap; 412 unique on-chain buyers',
};

describe('renderCandidate', () => {
  it('emits decode 0x<address> as the primary command (lowercased address)', () => {
    const msg = renderCandidate(cand);
    expect(msg).toContain('decode 0xabc0000000000000000000000000000000000001');
  });

  it('SAFETY INVARIANT: contains no real <@digits> mention that could trigger Claude_Dev', () => {
    const msg = renderCandidate(cand);
    expect(/<@\d+>/.test(msg)).toBe(false);
  });

  it('emits decode @<name> ONLY when the name matches the handle regex', () => {
    expect(renderCandidate({ ...cand, name: 'Wasabot' })).toContain('decode @Wasabot');
    expect(renderCandidate({ ...cand, name: 'Degen Claw' })).not.toContain('decode @Degen Claw');
  });
});

describe('renderHeartbeat', () => {
  it('always reports the run even when no candidate', () => {
    expect(renderHeartbeat({ scanned: 120, topJuice: 0, candidate: null }))
      .toContain('candidate=none');
  });
});
