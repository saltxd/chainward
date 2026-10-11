import { ApiError } from './api';
import { CHECKS_RUN } from './checkCount';

/**
 * What a running check is doing, said in plain words, one step at a time. The
 * steps are the order the check really works in; the page advances them on a
 * timer because the server reports only queued / ready, and holds on the last.
 */
export function checkSteps(chain: keyof typeof CHECKS_RUN = 'base'): readonly string[] {
  return [
    'Looking up the wallet',
    'Reading its last 30 days of transfers',
    'Counting who it deals with',
    'Checking what it holds',
    `Running ${CHECKS_RUN[chain]} checks against what we found`,
    'Writing up the answer',
  ];
}

export const CHECK_STEPS = checkSteps('base');

const STEP_MS = 4_000;

export function progressStep(elapsedMs: number): number {
  return Math.min(CHECK_STEPS.length - 1, Math.max(0, Math.floor(elapsedMs / STEP_MS)));
}

/** A hiccup between the browser and our server, worth waiting through rather than showing as a failure. */
export function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) return err.code === 'BAD_RESPONSE' || err.code === 'UPSTREAM' || err.code === 'UNKNOWN';
  return err instanceof TypeError; // network error: offline, reset, blocked
}
