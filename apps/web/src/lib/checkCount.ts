/**
 * How many checks a report runs, per chain: Base runs the whole catalog
 * (RISK_CHECKS in @chainward/decode), BNB Chain drops the Base-only ones. The web
 * app does not bundle @chainward/decode, so the numbers live here, with no
 * imports, and packages/decode/__tests__/check-count.test.ts fails if they drift.
 */
export const CHECKS_RUN = { base: 9, bsc: 6 } as const;
