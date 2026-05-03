import { describe, it, expect } from 'vitest';
import { findPeers, computeClusterStatus } from '../src/peers.js';

const observatorySample = [
  { address: '0xAxelrod', name: 'Axelrod', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xOtto', name: 'Otto AI', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xNox', name: 'Nox', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xLuna', name: 'Luna', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xLucien', name: 'Director Lucien', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xSympson', name: 'Sympson', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xClaw', name: 'ClawFeed', framework: 'virtuals', cluster: 'mediahouse', classification: 'active' },
];

describe('findPeers', () => {
  it('returns active and dormant cohorts from the observatory', () => {
    const result = findPeers({
      framework: 'virtuals_acp',
      cluster: null,
      observatory: observatorySample,
      excludeAddress: '0xAxelrod',
    });
    expect(result.similar_active).toContain('Otto AI');
    expect(result.similar_active).not.toContain('Axelrod');
  });
});

describe('computeClusterStatus', () => {
  it('returns collapsed when >=75% of cluster is dormant', () => {
    const status = computeClusterStatus('mediahouse', observatorySample);
    expect(status).toBe('collapsed'); // 3 dormant / 4 total = 75%
  });
  it('returns null when wallet has no cluster', () => {
    expect(computeClusterStatus(null, observatorySample)).toBeNull();
  });
});
