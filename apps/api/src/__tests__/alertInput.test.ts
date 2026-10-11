import { describe, expect, it } from 'vitest';
import { parseCreateAlert } from '../lib/alertInput.js';

// `chainward alerts create` (CLI 0.1.x, already published) sends an inactivity
// alert as thresholdValue "<hours>" with thresholdUnit "hours". The API used to
// refuse that unit with a 400. An inactivity alert is judged on its lookback
// window (the dashboard sends lookbackWindow), so the hours become that window.

const base = { walletAddress: '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a', chain: 'base', channels: ['webhook'] };

describe('parseCreateAlert', () => {
  it('accepts the published CLI inactivity alert and turns its hours into the lookback window', () => {
    const input = parseCreateAlert({ ...base, alertType: 'inactivity', thresholdValue: '36', thresholdUnit: 'hours' });
    expect(input.lookbackWindow).toBe('36 hours');
    expect(input.thresholdValue).toBeUndefined();
    expect(input.thresholdUnit).toBeUndefined();
  });

  it('keeps an explicit lookback window over the hours', () => {
    const input = parseCreateAlert({ ...base, alertType: 'inactivity', thresholdValue: '36', thresholdUnit: 'hours', lookbackWindow: '2 days' });
    expect(input.lookbackWindow).toBe('2 days');
  });

  it('leaves the dashboard inactivity alert as it is', () => {
    const input = parseCreateAlert({ ...base, alertType: 'inactivity', lookbackWindow: '24h' });
    expect(input).toMatchObject({ alertType: 'inactivity', lookbackWindow: '24h' });
    expect(input.thresholdUnit).toBeUndefined();
  });

  it('still accepts usd, native and percentage', () => {
    for (const thresholdUnit of ['usd', 'native', 'percentage']) {
      expect(parseCreateAlert({ ...base, alertType: 'large_transfer', thresholdValue: '100', thresholdUnit }).thresholdUnit).toBe(thresholdUnit);
    }
  });

  it('refuses hours on an alert that is not about inactivity', () => {
    expect(() => parseCreateAlert({ ...base, alertType: 'large_transfer', thresholdValue: '100', thresholdUnit: 'hours' })).toThrow();
  });

  it('refuses hours that are not a positive number', () => {
    expect(() => parseCreateAlert({ ...base, alertType: 'inactivity', thresholdValue: 'soon', thresholdUnit: 'hours' })).toThrow();
    expect(() => parseCreateAlert({ ...base, alertType: 'inactivity', thresholdValue: '0', thresholdUnit: 'hours' })).toThrow();
  });
});
