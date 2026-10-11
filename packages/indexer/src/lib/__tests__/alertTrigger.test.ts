import { describe, expect, it } from 'vitest';
import { buildWebhookPayload, triggerThreshold, triggerUnit, withConfigTrigger } from '../alertTrigger.js';

// The custom-webhook payload's trigger block said unit "usd" and threshold null
// on every alert. It now says what the value measures and the threshold the
// evaluator compared it against, from the alert's config.

const config = (alertType: string, thresholdValue: string | null, lookbackWindow: string | null = null) => ({
  alertType,
  thresholdValue,
  lookbackWindow,
});

describe('triggerUnit', () => {
  it('names what the trigger value measures for each alert type', () => {
    expect(triggerUnit('large_transfer')).toBe('usd');
    expect(triggerUnit('gas_spike')).toBe('usd');
    expect(triggerUnit('idle_balance')).toBe('usd');
    expect(triggerUnit('balance_drop')).toBe('percentage');
    expect(triggerUnit('inactivity')).toBe('hours');
  });

  it('is null for alerts that carry no value', () => {
    expect(triggerUnit('failed_tx')).toBeNull();
    expect(triggerUnit('new_contract')).toBeNull();
  });
});

describe('triggerThreshold', () => {
  it('reads the threshold value from the config', () => {
    expect(triggerThreshold(config('large_transfer', '250'))).toBe(250);
    expect(triggerThreshold(config('gas_spike', '2.5'))).toBe(2.5);
    expect(triggerThreshold(config('balance_drop', '35'))).toBe(35);
    expect(triggerThreshold(config('idle_balance', '75', '2 days'))).toBe(75);
  });

  it('uses the defaults the evaluator uses when the config has none', () => {
    expect(triggerThreshold(config('balance_drop', null))).toBe(20);
    expect(triggerThreshold(config('idle_balance', null))).toBe(50);
    expect(triggerThreshold(config('large_transfer', null))).toBe(0);
  });

  it('reads an inactivity threshold in hours from the lookback window, as Postgres returns it', () => {
    expect(triggerThreshold(config('inactivity', null, '36:00:00'))).toBe(36);
    expect(triggerThreshold(config('inactivity', null, '2 days'))).toBe(48);
    expect(triggerThreshold(config('inactivity', null, null))).toBe(24);
  });

  it('is null for alerts with no threshold', () => {
    expect(triggerThreshold(config('failed_tx', null))).toBeNull();
    expect(triggerThreshold(config('new_contract', null))).toBeNull();
  });
});

describe('buildWebhookPayload', () => {
  const job = {
    alertType: 'balance_drop',
    severity: 'warning',
    agent: { name: 'Swap Agent', wallet: '0xagent', chain: 'base' },
    triggerValue: 35.2,
    triggerTxHash: null,
    timestamp: '2026-10-11T12:00:00.000Z',
  };

  it('fills unit and threshold from the job', () => {
    const payload = buildWebhookPayload({ ...job, triggerUnit: 'percentage', triggerThreshold: 20 });
    expect(payload.trigger).toEqual({ value: 35.2, unit: 'percentage', threshold: 20, tx_hash: null });
    expect(payload).toMatchObject({ type: 'balance_drop', severity: 'warning', agent: job.agent, timestamp: job.timestamp });
  });

  it('falls back to the unit by alert type for a job queued before the threshold was recorded', () => {
    const payload = buildWebhookPayload(job);
    expect(payload.trigger).toEqual({ value: 35.2, unit: 'percentage', threshold: null, tx_hash: null });
  });
});

// The API's "send a test alert" job (and any job queued before the evaluator
// recorded the threshold) carries none: delivery reads it from the config.
describe('withConfigTrigger', () => {
  const job = {
    alertType: 'inactivity',
    severity: 'info',
    agent: { name: null, wallet: '0xagent', chain: 'base' },
    triggerValue: null,
    triggerTxHash: null,
    timestamp: '2026-10-11T12:00:00.000Z',
  };

  it('fills unit and threshold from the alert config when the job has none', async () => {
    const filled = await withConfigTrigger(job, async () => config('inactivity', null, '36:00:00'));
    expect(buildWebhookPayload(filled).trigger).toMatchObject({ unit: 'hours', threshold: 36 });
  });

  it('keeps what the job carries without reading the config', async () => {
    let read = false;
    const kept = await withConfigTrigger({ ...job, triggerUnit: 'hours', triggerThreshold: 12 }, async () => {
      read = true;
      return config('inactivity', null, '36:00:00');
    });
    expect(read).toBe(false);
    expect(kept.triggerThreshold).toBe(12);
  });

  it('delivers anyway when the config cannot be read', async () => {
    const same = await withConfigTrigger(job, async () => {
      throw new Error('db down');
    });
    expect(same).toEqual(job);
    expect(await withConfigTrigger(job, async () => undefined)).toEqual(job);
  });
});
