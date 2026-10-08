import type { HireSummary } from './hire-check.js';
import type { RiskBand, RiskFlag } from './risk-flags.js';

// One line a buyer can act on, on top of each check. The evidence sits under it
// and the limits one line below, so the verdict never claims more than the
// check measured. The decodes keep their hedged voice; the product decides.

export interface Verdict<L extends string = string> {
  /** Stable machine label. */
  label: L;
  /** The decision, two or three words. */
  text: string;
  /** The one fact it rests on. */
  reason: string;
  /** What the check cannot see, in one line. */
  limits: string;
}

// ─── Hire check ───────────────────────────────────────────────────────────────

export type HireVerdictLabel = 'hired_by_others' | 'hired_by_own_circle' | 'not_enough_data';

const HIRE_LIMITS =
  'Follows each hirer’s first incoming BNB and stablecoin up to 4 hops and stops at exchanges and contracts: "no link found" is not proven independence.';

export function hireVerdict(
  summary: HireSummary,
  hires: { distinct_hirers: number; total: number },
  windowDays: number,
): Verdict<HireVerdictLabel> {
  const n = hires.distinct_hirers;
  const unlinked = summary.independent_within_limits;
  const linked = summary.owner_linked;
  const open = summary.inconclusive;
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

  if (n < 3) {
    return {
      label: 'not_enough_data',
      text: 'Not enough data',
      reason: `${plural(n, 'distinct hirer')} in the last ${windowDays} days; the rule needs 3.`,
      limits: HIRE_LIMITS,
    };
  }
  if (unlinked >= 3) {
    return {
      label: 'hired_by_others',
      text: 'Hired by others',
      reason: `${unlinked} of ${n} hirers in the last ${windowDays} days show no funding link to the owner within 4 hops.`,
      limits: HIRE_LIMITS,
    };
  }
  if (linked >= 1 && linked >= unlinked && linked >= open) {
    return {
      label: 'hired_by_own_circle',
      text: 'Hired by its own circle',
      reason: `${linked} of ${n} hirers trace back to the owner or share its funder; ${unlinked} ${unlinked === 1 ? 'does' : 'do'} not.`,
      limits: HIRE_LIMITS,
    };
  }
  return {
    label: 'not_enough_data',
    text: 'Not enough data',
    reason: `${open} of ${n} hirers could not be settled either way (same hub within a day, or untraced); ${linked} linked, ${unlinked} not.`,
    limits: HIRE_LIMITS,
  };
}

// ─── Seller check ─────────────────────────────────────────────────────────────

export type SellerVerdictLabel = 'real_demand' | 'self_funded_demand' | 'mixed' | 'not_enough_data';

export interface SellerVerdictInput {
  buyers_checked: number;
  seller_funded: { buyers: number; volume_share: number | null; hops: Record<string, number> };
  paid_back_share: number | null;
  via_intermediary_share: number | null;
  proxied_payers: Array<{ payers_resolved: number }>;
  signals: Array<{ id: string }>;
  window_days: number;
}

const SELLER_LIMITS =
  'Top buyers’ largest funders are followed up to 4 hops and the walk stops at exchanges: a loop through an exchange account is not visible.';

const pct = (x: number | null | undefined) => `${Math.round((x ?? 0) * 100)}%`;

export function sellerVerdict(r: SellerVerdictInput): Verdict<SellerVerdictLabel> {
  const ids = new Set(r.signals.map((s) => s.id));
  const checked = r.buyers_checked;
  const proxiesNamed = r.proxied_payers.some((p) => p.payers_resolved > 0);

  if (ids.has('buyers_funded_by_seller')) {
    const hops = Object.keys(r.seller_funded.hops).map(Number);
    const maxHop = hops.length ? Math.max(...hops) : 4;
    return {
      label: 'self_funded_demand',
      text: 'Self-funded demand',
      reason: `${r.seller_funded.buyers} of ${checked} top buyers checked trace back to this address within ${maxHop} hop${maxHop === 1 ? '' : 's'} (${pct(r.seller_funded.volume_share)} of their volume).`,
      limits: SELLER_LIMITS,
    };
  }
  if (ids.has('money_flows_back')) {
    return {
      label: 'self_funded_demand',
      text: 'Self-funded demand',
      reason: `Stablecoins sent back to its own buyers equal ${pct(r.paid_back_share)} of sampled inflow.`,
      limits: SELLER_LIMITS,
    };
  }
  if ((r.via_intermediary_share ?? 0) >= 0.5 && !proxiesNamed) {
    return {
      label: 'not_enough_data',
      text: 'Not enough data',
      reason: `${pct(r.via_intermediary_share)} of inflow arrived through facilitator proxies whose payers could not be named.`,
      limits: SELLER_LIMITS,
    };
  }
  if (checked < 5) {
    return {
      label: 'not_enough_data',
      text: 'Not enough data',
      reason: `Only ${checked} buyer${checked === 1 ? '' : 's'} could be checked in the last ${r.window_days} days.`,
      limits: SELLER_LIMITS,
    };
  }
  if (ids.has('common_funder') || ids.has('concentrated_buyers')) {
    const what = ids.has('common_funder') ? 'one wallet funds most of the top buyers checked' : 'one buyer is most of the inflow';
    return {
      label: 'mixed',
      text: 'Mixed',
      reason: `No checked buyer traces back to this address, but ${what}.`,
      limits: SELLER_LIMITS,
    };
  }
  return {
    label: 'real_demand',
    text: 'Real demand',
    reason: `None of the ${checked} top buyers checked traces back to this address within 4 hops, and it sent nothing back to them.`,
    limits: SELLER_LIMITS,
  };
}

// ─── Counterparty check ───────────────────────────────────────────────────────

export type CounterpartyVerdictLabel = 'pay' | 'hold' | 'unknown';

export interface CounterpartyActivity {
  transfers_30d: number;
  unique_counterparties_30d: number;
  latest_transfer_age_hours: number | null;
}

const COUNTERPARTY_LIMITS = 'On-chain behavior only. Absence of flags is not a clearance of the counterparty.';

const SEVERITY_ORDER: Record<RiskFlag['severity'], number> = { high: 3, medium: 2, low: 1, info: 0 };

function ago(hours: number | null): string {
  if (hours === null) return 'unknown';
  if (hours < 1) return 'under an hour ago';
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function counterpartyVerdict(
  assessment: { band: RiskBand; flags: RiskFlag[] },
  activity: CounterpartyActivity | null,
  opts: { transfersUnavailable?: boolean } = {},
): Verdict<CounterpartyVerdictLabel> {
  if (opts.transfersUnavailable) {
    return {
      label: 'unknown',
      text: 'Unknown',
      reason: 'The on-chain sources this check reads were unavailable, so activity could not be assessed.',
      limits: COUNTERPARTY_LIMITS,
    };
  }
  const flags = [...assessment.flags].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  const top = flags[0];
  if (top && top.severity === 'high') {
    return { label: 'hold', text: 'Hold', reason: `${top.title}: ${top.evidence}.`.replace(/\.\.$/, '.'), limits: COUNTERPARTY_LIMITS };
  }
  if (assessment.band === 'high-signal' || assessment.band === 'elevated') {
    const mediums = flags.filter((f) => f.severity === 'medium');
    const first = mediums[0] ?? top;
    return {
      label: 'hold',
      text: 'Hold',
      reason: first
        ? `${mediums.length || flags.length} ${first.severity}-severity flag${(mediums.length || flags.length) === 1 ? '' : 's'} in the last 30 days; the first is ${first.title}.`
        : 'The report carries an elevated signal band.',
      limits: COUNTERPARTY_LIMITS,
    };
  }
  if (!activity || activity.transfers_30d === 0) {
    return {
      label: 'unknown',
      text: 'Unknown',
      reason: 'No transfers in the last 30 days on this chain.',
      limits: COUNTERPARTY_LIMITS,
    };
  }
  return {
    label: 'pay',
    text: 'Pay',
    reason: `Active: ${activity.transfers_30d} transfers with ${activity.unique_counterparties_30d} counterparties in the last 30 days, last one ${ago(activity.latest_transfer_age_hours)}, no high-severity flag.`,
    limits: COUNTERPARTY_LIMITS,
  };
}
