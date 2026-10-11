/** The threshold fields `alerts create` sends, from the prompt answers. */
export interface AlertParams {
  thresholdValue?: string;
  thresholdUnit?: 'usd' | 'percentage';
  lookbackWindow?: string;
}

export function alertParams(alertType: string, answers: { value?: string; window?: string }): AlertParams {
  const { value, window } = answers;
  switch (alertType) {
    case 'large_transfer':
    case 'gas_spike':
      return { thresholdValue: value, thresholdUnit: 'usd' };
    case 'balance_drop':
      return { thresholdValue: value, thresholdUnit: 'percentage', lookbackWindow: window };
    case 'idle_balance':
      return { thresholdValue: value, thresholdUnit: 'usd', lookbackWindow: window };
    case 'inactivity':
      // The hours of silence are the alert's lookback window: the field the API
      // evaluates and the dashboard sends. CLI 0.1.1 sent thresholdUnit "hours",
      // which the API refused with a 400.
      return { lookbackWindow: `${Number(value)} hours` };
    default:
      // failed_tx and new_contract have no threshold.
      return {};
  }
}
