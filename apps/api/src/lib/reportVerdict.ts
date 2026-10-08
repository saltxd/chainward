import { counterpartyVerdict, STATE_READ_UNAVAILABLE, type CounterpartyVerdictLabel, type RiskAssessment, type Verdict } from '@chainward/decode';
import { stateUnavailable, transfersUnavailable } from './reportCoverage.js';

/** Pay / Hold / Unknown for a stored report: the assessment plus the decode's activity numbers. */
export function reportVerdict(assessment: Pick<RiskAssessment, 'band' | 'flags'>, reportData: unknown): Verdict<CounterpartyVerdictLabel> {
  const activity = readActivity(reportData);
  const verdict = counterpartyVerdict(assessment, activity, { transfersUnavailable: Boolean(transfersUnavailable(reportData)) });
  // A high-severity check that could not run (the balance was never read) means
  // no Pay: say what was not read instead of passing on a placeholder.
  const unread = stateUnavailable(reportData);
  if (verdict.label === 'pay' && unread.includes('usdc_balance')) {
    return { ...verdict, label: 'unknown', text: 'Unknown', reason: STATE_READ_UNAVAILABLE.usdc_balance! };
  }
  return verdict;
}

function readActivity(reportData: unknown) {
  if (!reportData || typeof reportData !== 'object') return null;
  const a = (reportData as { activity?: Record<string, unknown> }).activity;
  if (!a || typeof a !== 'object') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    transfers_30d: num(a.transfers_30d),
    unique_counterparties_30d: num(a.unique_counterparties_30d),
    latest_transfer_age_hours: typeof a.latest_transfer_age_hours === 'number' ? a.latest_transfer_age_hours : null,
  };
}
