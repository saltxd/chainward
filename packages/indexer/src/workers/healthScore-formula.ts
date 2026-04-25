// Pure health-score formula. No DB / Redis / logger imports — must remain
// side-effect-free so it can be unit-tested without env vars.

export interface HealthInputs {
  uptimePct: number;       // 0–100
  failureRate: number;     // 0–100
  gasEfficiency: number;   // 0–100
  consistency: number;     // 0–100
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeHealthScore(inputs: HealthInputs): number {
  const u = clamp(inputs.uptimePct);
  const f = clamp(inputs.failureRate);
  const g = clamp(inputs.gasEfficiency);
  const c = clamp(inputs.consistency);

  return Math.round(0.30 * u + 0.25 * (100 - f) + 0.25 * g + 0.20 * c);
}
