import { counterpartyVerdict, type CounterpartyVerdictLabel, type RiskAssessment, type Verdict } from '@chainward/decode';
import { transfersUnavailable } from './reportCoverage.js';

/** Pay / Hold / Unknown for a stored report: the assessment plus the decode's activity numbers. */
export function reportVerdict(assessment: Pick<RiskAssessment, 'band' | 'flags'>, reportData: unknown): Verdict<CounterpartyVerdictLabel> {
  const activity = readActivity(reportData);
  return counterpartyVerdict(assessment, activity, { transfersUnavailable: Boolean(transfersUnavailable(reportData)) });
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
