import type { SurvivalClassification } from './types.js';

export interface SurvivalInput {
  transfers_7d: number;
  latest_transfer_age_hours: number | null;
  /** Days of transfers the decode read (30 by default). */
  window_days?: number;
  /** The wallet holds USDC: that balance is history even if no transfer falls in the window. */
  holds_value?: boolean;
}

export interface SurvivalResult {
  classification: SurvivalClassification;
  rationale: string;
}

// Boundary table at classifier_version 1.0.0 — see spec section "Boundary tables"
//   active   = transfers_7d >= 5 AND latest_transfer_age_hours <= 48
//   at_risk  = transfers_7d in [1, 4] OR latest_transfer_age_hours in (48, 168]
//   dormant  = transfers_7d == 0 AND latest_transfer_age_hours > 168
//   unknown  = latest_transfer_age_hours == null (no token transfers ever)

export function classifySurvival(input: SurvivalInput): SurvivalResult {
  const { transfers_7d, latest_transfer_age_hours: age } = input;

  if (age === null) {
    // Transfers are read for a window, not for life. A balance from before the
    // window is history too: the wallet is dormant, not unknown. Dormant means
    // more than 7 days of silence, so a window shorter than that cannot show it.
    if (input.holds_value && (input.window_days ?? 30) >= 7) {
      return {
        classification: 'dormant',
        rationale: `no transfers in the last ${input.window_days ?? 30} days; holds a balance from before the window`,
      };
    }
    return {
      classification: 'unknown',
      rationale: 'no ERC-20 transfers found; wallet may be ETH-only or never used as agent',
    };
  }

  if (transfers_7d >= 5 && age <= 48) {
    return {
      classification: 'active',
      rationale: `${transfers_7d} transfers in last 7d, latest ${formatAge(age)} ago`,
    };
  }

  if (transfers_7d === 0 && age > 168) {
    return {
      classification: 'dormant',
      rationale: `no transfers in last 7 days; last activity ${formatAge(age)} ago`,
    };
  }

  if ((transfers_7d >= 1 && transfers_7d <= 4) || (age > 48 && age <= 168)) {
    return {
      classification: 'at_risk',
      rationale: `${transfers_7d} transfers in last 7d, latest ${formatAge(age)} ago`,
    };
  }

  return {
    classification: 'unknown',
    rationale: 'classification boundaries did not match',
  };
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}
