import { parsePgInterval } from './interval.js';

export type TriggerUnit = 'usd' | 'percentage' | 'hours';

const HOUR_MS = 60 * 60 * 1000;

/**
 * What an alert's trigger value measures. The evaluator compares in these
 * units whatever thresholdUnit the config carries: USD for transfers, gas and
 * idle balances, percent for a balance drop, hours of silence for inactivity.
 */
export function triggerUnit(alertType: string): TriggerUnit | null {
  switch (alertType) {
    case 'large_transfer':
    case 'gas_spike':
    case 'idle_balance':
      return 'usd';
    case 'balance_drop':
      return 'percentage';
    case 'inactivity':
      return 'hours';
    default:
      return null; // failed_tx, new_contract: no value, no threshold
  }
}

export interface TriggerConfig {
  alertType: string;
  thresholdValue: string | null;
  lookbackWindow: string | null;
}

/** The threshold the evaluator compared the value against, with its defaults. */
export function triggerThreshold(config: TriggerConfig): number | null {
  const set = config.thresholdValue ? parseFloat(config.thresholdValue) : NaN;
  switch (config.alertType) {
    case 'large_transfer':
    case 'gas_spike':
      return Number.isFinite(set) ? set : 0;
    case 'balance_drop':
      return Number.isFinite(set) ? set : 20;
    case 'idle_balance':
      return Number.isFinite(set) ? set : 50;
    case 'inactivity': {
      // Inactivity fires on its lookback window: the hours of silence.
      const ms = parsePgInterval(config.lookbackWindow ?? '24 hours');
      return ms === null ? null : ms / HOUR_MS;
    }
    default:
      return null;
  }
}

export interface WebhookPayloadInput {
  alertType: string;
  severity: string;
  agent: { name: string | null; wallet: string; chain: string };
  triggerValue: number | null;
  triggerTxHash: string | null;
  timestamp: string;
  /** Absent on delivery jobs queued before these were recorded. */
  triggerUnit?: TriggerUnit | null;
  triggerThreshold?: number | null;
}

/**
 * A delivery job with its unit and threshold. The evaluator records both; the
 * API's test-alert job, and jobs queued before they were recorded, carry none,
 * so they are read from the alert config. A failed read never blocks delivery.
 */
export async function withConfigTrigger<T extends WebhookPayloadInput>(
  data: T,
  loadConfig: () => Promise<TriggerConfig | undefined>,
): Promise<T> {
  if (data.triggerThreshold !== undefined) return data;
  try {
    const config = await loadConfig();
    if (!config) return data;
    return { ...data, triggerUnit: triggerUnit(config.alertType), triggerThreshold: triggerThreshold(config) };
  } catch {
    return data;
  }
}

/** The standard alert payload for custom webhook delivery. */
export function buildWebhookPayload(data: WebhookPayloadInput) {
  return {
    type: data.alertType,
    severity: data.severity,
    agent: {
      name: data.agent.name,
      wallet: data.agent.wallet,
      chain: data.agent.chain,
    },
    trigger: {
      value: data.triggerValue,
      unit: data.triggerUnit !== undefined ? data.triggerUnit : triggerUnit(data.alertType),
      threshold: data.triggerThreshold ?? null,
      tx_hash: data.triggerTxHash,
    },
    timestamp: data.timestamp,
    dashboard_url: `https://chainward.ai/agents`,
  };
}
