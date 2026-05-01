import { describe, it, expect } from 'vitest';
import { compareACPClaims } from '../src/discrepancies.js';

describe('compareACPClaims', () => {
  it('emits a migration_artifact discrepancy for 2999-12-31 ACP lastActiveAt', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2999-12-31T00:00:00Z', isOnline: false },
      chain: { latest_transfer_at: '2026-04-29T00:00:00Z', active_today: false, active_7d: true },
    });
    const migration = result.discrepancies.find((d) => d.reason === 'migration_artifact');
    expect(migration).toBeDefined();
    expect(migration?.field).toBe('lastActiveAt');
    expect(migration?.severity).toBe('info');
    expect(result.checks_performed).toContain('lastActiveAt');
  });

  it('emits no discrepancy when ACP isOnline matches chain reality', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-30T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-30T00:00:00Z', active_today: true, active_7d: true },
    });
    expect(result.discrepancies.filter((d) => d.field === 'isOnline')).toHaveLength(0);
    expect(result.checks_performed).toContain('isOnline');
  });

  it('emits a warn discrepancy when ACP says online but chain shows 7d dormancy', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-29T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-01T00:00:00Z', active_today: false, active_7d: false },
    });
    const isOnline = result.discrepancies.find((d) => d.field === 'isOnline');
    expect(isOnline).toBeDefined();
    expect(isOnline?.severity).toBe('warn');
  });

  it('populates checks_performed even when no discrepancies found', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-30T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-30T00:00:00Z', active_today: true, active_7d: true },
    });
    expect(result.checks_performed.length).toBeGreaterThan(0);
  });
});
