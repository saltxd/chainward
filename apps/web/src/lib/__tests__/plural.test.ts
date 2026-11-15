import { describe, expect, it } from 'vitest';
import { plural } from '../plural';

describe('plural', () => {
  it('is singular for exactly one and plural otherwise', () => {
    expect(plural(1, 'buyer')).toBe('buyer');
    expect(plural(0, 'buyer')).toBe('buyers');
    expect(plural(25, 'buyer')).toBe('buyers');
    expect(plural(1.5, 'job')).toBe('jobs');
  });

  it('takes an irregular plural', () => {
    expect(plural(1, 'tx', 'txs')).toBe('tx');
    expect(plural(2, 'counterparty', 'counterparties')).toBe('counterparties');
  });
});
