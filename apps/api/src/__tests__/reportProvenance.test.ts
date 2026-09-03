import { describe, expect, it } from 'vitest';
import { extractProvenance } from '../lib/reportProvenance';

describe('extractProvenance', () => {
  it('returns undefined when the report has no data', () => {
    expect(extractProvenance(null)).toBeUndefined();
    expect(extractProvenance(undefined)).toBeUndefined();
  });

  it('returns undefined for reports written before provenance was recorded', () => {
    expect(
      extractProvenance({ fetch_meta: { transfers_fetched: 10, transfers_truncated: false } }),
    ).toBeUndefined();
  });

  it('exposes the RPC role and head lag when the decode recorded them', () => {
    expect(
      extractProvenance({
        fetch_meta: {
          transfers_fetched: 10,
          transfers_truncated: false,
          data_source: 'sentinel',
          head_lag_seconds: 4,
        },
      }),
    ).toEqual({ data_source: 'sentinel', head_lag_seconds: 4 });
  });

  it('passes a fallback source through unchanged', () => {
    expect(
      extractProvenance({
        fetch_meta: { transfers_fetched: 0, transfers_truncated: false, data_source: 'fallback', head_lag_seconds: 2 },
      }),
    ).toEqual({ data_source: 'fallback', head_lag_seconds: 2 });
  });

  it('ignores malformed values rather than leaking them to the client', () => {
    expect(
      extractProvenance({ fetch_meta: { data_source: 'mystery', head_lag_seconds: 'soon' } }),
    ).toBeUndefined();
  });
});
