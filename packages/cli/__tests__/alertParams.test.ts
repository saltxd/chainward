import { describe, expect, it } from 'vitest';
import { alertParams } from '../src/alertParams.js';

// What `chainward alerts create` sends for each alert type, after the prompts.
// CLI 0.1.1 sent inactivity as thresholdUnit "hours", which the API refused
// with a 400; the hours of silence are the alert's lookback window, the field
// the API evaluates and the dashboard sends.

describe('alertParams', () => {
  it('sends inactivity hours as the lookback window, with no threshold unit', () => {
    expect(alertParams('inactivity', { value: '36' })).toEqual({ lookbackWindow: '36 hours' });
  });

  it('sends USD thresholds for large transfers, gas spikes and idle balances', () => {
    expect(alertParams('large_transfer', { value: '100' })).toEqual({ thresholdValue: '100', thresholdUnit: 'usd' });
    expect(alertParams('gas_spike', { value: '5' })).toEqual({ thresholdValue: '5', thresholdUnit: 'usd' });
    expect(alertParams('idle_balance', { value: '50', window: '2 days' })).toEqual({
      thresholdValue: '50',
      thresholdUnit: 'usd',
      lookbackWindow: '2 days',
    });
  });

  it('sends a balance drop as a percentage over its window', () => {
    expect(alertParams('balance_drop', { value: '20', window: '6 hours' })).toEqual({
      thresholdValue: '20',
      thresholdUnit: 'percentage',
      lookbackWindow: '6 hours',
    });
  });

  it('sends nothing extra for failed transactions and new contracts', () => {
    expect(alertParams('failed_tx', {})).toEqual({});
    expect(alertParams('new_contract', {})).toEqual({});
  });

  it('never sends a unit the API refuses', () => {
    for (const type of ['large_transfer', 'gas_spike', 'balance_drop', 'inactivity', 'idle_balance']) {
      const unit = alertParams(type, { value: '1', window: '1 hour' }).thresholdUnit;
      expect(unit === undefined || ['usd', 'native', 'percentage'].includes(unit)).toBe(true);
    }
  });
});
