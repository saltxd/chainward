import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, publicApi } from '../api';
import { CHECK_STEPS, checkSteps, isTransient, progressStep } from '../checkProgress';
import { CHECKS_RUN, TRANSFER_WINDOW_DAYS } from '../checkCount';

// While a check runs the page says what it is doing, step by step, and a hiccup
// between the browser and our server never shows up as a raw parser error.

afterEach(() => vi.unstubAllGlobals());

describe('progressStep', () => {
  it('walks through the steps every few seconds and holds on the last', () => {
    expect(CHECK_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(progressStep(0)).toBe(0);
    expect(progressStep(4_100)).toBe(1);
    expect(progressStep(8_200)).toBe(2);
    expect(progressStep(10 * 60_000)).toBe(CHECK_STEPS.length - 1);
  });

  it('describes what the check really does, in plain words', () => {
    expect(CHECK_STEPS.join(' ')).toMatch(/transfers/i);
    expect(CHECK_STEPS.join(' ')).not.toMatch(/decode|deriv|classif|forensic/i);
  });

  it('says how many checks run on the chain being checked', () => {
    expect(checkSteps('base')).toContain(`Running ${CHECKS_RUN.base} checks against what we found`);
    expect(checkSteps('bsc')).toContain(`Running ${CHECKS_RUN.bsc} checks against what we found`);
    expect(CHECK_STEPS).toEqual(checkSteps('base'));
    expect(CHECKS_RUN.base).toBeGreaterThan(CHECKS_RUN.bsc);
  });

  it('says how many days of transfers it reads on the chain being checked', () => {
    expect(checkSteps('base')).toContain('Reading its last 30 days of transfers');
    expect(checkSteps('bsc')).toContain('Reading its last 14 days of transfers');
    expect(TRANSFER_WINDOW_DAYS).toEqual({ base: 30, bsc: 14 });
  });
});

describe('fetch errors', () => {
  it('a web page where data was expected becomes a plain, retryable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><html>502</html>', { status: 502, headers: { 'content-type': 'text/html' } })));
    const err = await publicApi.getReport('0xabc').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('BAD_RESPONSE');
    expect(err.message).not.toMatch(/JSON|DOCTYPE|token/);
    expect(isTransient(err)).toBe(true);
  });

  it("the proxy's own 502 is retryable too; a real not-found or bad address is not", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Failed to reach API' }), { status: 502 })));
    const err = await publicApi.getReport('0xabc').catch((e) => e);
    expect(err.code).toBe('UPSTREAM');
    expect(isTransient(err)).toBe(true);
    expect(isTransient(new ApiError('nope', 'NOT_FOUND'))).toBe(false);
    expect(isTransient(new ApiError('bad', 'INVALID_TARGET'))).toBe(false);
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true);
  });
});
