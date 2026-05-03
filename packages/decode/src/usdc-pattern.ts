import type { SurvivalClassification, UsdcPattern } from './types.js';

export interface UsdcPatternInput {
  classification: SurvivalClassification;
  usdc_balance: number;
}

// Boundary table v1.0.0 — see spec section "Boundary tables"
export function classifyUsdcPattern(input: UsdcPatternInput): UsdcPattern {
  const { classification, usdc_balance } = input;

  if (classification === 'unknown') return 'unknown';

  if (classification === 'active') {
    return usdc_balance < 50 ? 'running' : 'accumulating';
  }

  // dormant or at_risk
  if (classification === 'dormant') {
    return usdc_balance >= 100 ? 'graveyard' : 'inactive';
  }

  // at_risk: treat similarly to active for funding pattern
  return usdc_balance < 50 ? 'running' : 'accumulating';
}
