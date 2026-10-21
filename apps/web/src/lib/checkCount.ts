/**
 * How many checks a report runs, per chain: Base runs the whole catalog
 * (RISK_CHECKS in @chainward/decode), BNB Chain drops the Base-only ones. The web
 * app does not bundle @chainward/decode, so the numbers live here, with no
 * imports, and packages/decode/__tests__/check-count.test.ts fails if they drift.
 */
export const CHECKS_RUN = { base: 11, bsc: 7 } as const;

/**
 * Days of transfers a check reads, per chain: Base reads the 30-day explorer
 * horizon, BNB Chain scans 14 days of public RPC logs (DEFAULT_RPC_WINDOW_DAYS).
 * A finished report carries the window it really covered (coverage.window.days);
 * this is what a running check says before there is one.
 */
export const TRANSFER_WINDOW_DAYS = { base: 30, bsc: 14 } as const;
