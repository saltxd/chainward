// scripts/auto-decode/lib/resolver.ts
import type { Target } from "./validators";

const ACP_AGENTS_URL = "https://acpx.virtuals.io/api/agents";

export interface ResolverDeps {
  fetch: typeof fetch;
}

export interface ResolvedTarget {
  address: string;
  name: string | null;
}

interface AcpAgentRecord {
  id: number;
  name: string;
  walletAddress: string;
}

// The API may return { agents: [...] } (test fixtures) or { data: [...] } (live API)
interface AcpAgentsResponse {
  agents?: AcpAgentRecord[];
  data?: AcpAgentRecord[];
}

export async function resolveTarget(
  target: Target,
  deps: ResolverDeps,
): Promise<ResolvedTarget> {
  if (target.kind === "address") {
    return { address: target.value, name: null };
  }

  const res = await deps.fetch(ACP_AGENTS_URL);
  if (!res.ok) {
    throw new Error(`ACP API returned ${(res as Response).status}`);
  }

  const body = (await res.json()) as AcpAgentsResponse;
  const agents = body.agents ?? body.data ?? [];
  const wanted = target.value.toLowerCase();
  const match = agents.find((a) => a.name.toLowerCase() === wanted);
  if (!match) {
    throw new Error(`@${target.value} not found in ACP registry`);
  }

  return { address: match.walletAddress, name: match.name };
}
