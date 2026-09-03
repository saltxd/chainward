import { describe, expect, it } from 'vitest';
import { deriveNodeProvenance, type Telemetry } from '../provenance';

const base: Telemetry = {
  baseTip: 50_805_345,
  indexerStatus: 'online',
  indexerLastTxAt: null,
  nodeConfigured: true,
  nodeTip: 50_805_345,
  nodeLag: 0,
  nodeStatus: 'online',
};

describe('deriveNodeProvenance', () => {
  it('is unknown before telemetry has loaded', () => {
    expect(deriveNodeProvenance(null)).toEqual({ status: 'unknown', lag: null });
  });

  it('is unknown when no node is configured (self-hosters get the neutral claim)', () => {
    expect(deriveNodeProvenance({ ...base, nodeConfigured: false })).toEqual({
      status: 'unknown',
      lag: null,
    });
  });

  it('is live only when the node is online and reports a tip', () => {
    expect(deriveNodeProvenance(base)).toEqual({ status: 'live', lag: 0 });
  });

  it('is not live when the node is online but has no tip', () => {
    expect(deriveNodeProvenance({ ...base, nodeTip: null }).status).not.toBe('live');
  });

  it('is syncing with the lag when the node is degraded', () => {
    expect(
      deriveNodeProvenance({ ...base, nodeStatus: 'degraded', nodeLag: 444_658 }),
    ).toEqual({ status: 'syncing', lag: 444_658 });
  });

  it('is syncing when the node reports syncing', () => {
    expect(deriveNodeProvenance({ ...base, nodeStatus: 'syncing', nodeLag: 12 })).toEqual({
      status: 'syncing',
      lag: 12,
    });
  });

  it('is offline when the node probe failed', () => {
    expect(deriveNodeProvenance({ ...base, nodeStatus: 'offline', nodeTip: null })).toEqual({
      status: 'offline',
      lag: null,
    });
  });
});
