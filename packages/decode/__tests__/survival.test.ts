import { describe, it, expect } from 'vitest';
import { classifySurvival } from '../src/survival.js';

describe('classifySurvival', () => {
  it('classifies as active when transfers_7d >= 5 and recent', () => {
    const r = classifySurvival({ transfers_7d: 32, latest_transfer_age_hours: 1.2 });
    expect(r.classification).toBe('active');
  });

  it('classifies as at_risk when 1-4 transfers in last 7d', () => {
    const r = classifySurvival({ transfers_7d: 3, latest_transfer_age_hours: 50 });
    expect(r.classification).toBe('at_risk');
  });

  it('classifies as at_risk when last activity 48-168h ago', () => {
    const r = classifySurvival({ transfers_7d: 1, latest_transfer_age_hours: 100 });
    expect(r.classification).toBe('at_risk');
  });

  it('classifies as dormant when zero 7d transfers AND age > 168h', () => {
    const r = classifySurvival({ transfers_7d: 0, latest_transfer_age_hours: 500 });
    expect(r.classification).toBe('dormant');
    expect(r.rationale).toBeTruthy();
  });

  it('classifies ETH-only EOA (null age) as unknown', () => {
    const r = classifySurvival({ transfers_7d: 0, latest_transfer_age_hours: null });
    expect(r.classification).toBe('unknown');
  });

  it('produces a non-empty rationale for every classification', () => {
    const cases = [
      { transfers_7d: 32, latest_transfer_age_hours: 1 },
      { transfers_7d: 3, latest_transfer_age_hours: 50 },
      { transfers_7d: 0, latest_transfer_age_hours: 500 },
      { transfers_7d: 0, latest_transfer_age_hours: null },
    ];
    for (const c of cases) {
      expect(classifySurvival(c).rationale).not.toBe('');
    }
  });
});
