import type { Framework, ClusterStatus, SurvivalClassification } from './types.js';

export interface ObservatoryAgent {
  address: string;
  name: string;
  framework: string;
  cluster: string | null;
  classification: SurvivalClassification | string;
}

export interface FindPeersInput {
  framework: Framework;
  cluster: string | null;
  observatory: ObservatoryAgent[];
  excludeAddress: string;
  limit?: number;
}

export interface PeersResult {
  similar_active: string[];
  similar_dormant: string[];
}

export function findPeers(input: FindPeersInput): PeersResult {
  const { framework, observatory, excludeAddress } = input;
  const limit = input.limit ?? 5;
  const fw = framework.replace('virtuals_acp', 'virtuals');

  const cohort = observatory.filter(
    (a) => a.framework === fw && a.address.toLowerCase() !== excludeAddress.toLowerCase(),
  );

  const active = cohort.filter((a) => a.classification === 'active').slice(0, limit).map((a) => a.name);
  const dormant = cohort.filter((a) => a.classification === 'dormant').slice(0, limit).map((a) => a.name);

  return { similar_active: active, similar_dormant: dormant };
}

export function computeClusterStatus(
  cluster: string | null,
  observatory: ObservatoryAgent[],
): ClusterStatus {
  if (!cluster) return null;
  const members = observatory.filter((a) => a.cluster === cluster);
  if (members.length === 0) return null;

  const dormantPct = members.filter((a) => a.classification === 'dormant').length / members.length;
  const activePct = members.filter((a) => a.classification === 'active').length / members.length;

  if (dormantPct >= 0.75) return 'collapsed';
  if (activePct >= 0.5) return 'active';
  return 'mixed';
}
