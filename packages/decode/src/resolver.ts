// packages/decode/src/resolver.ts
import type { Target } from "./types.js";

const ACP_API_BASE = "https://acpx.virtuals.io/api";
const PAGE_SIZE = 100;

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

interface AcpAgentsResponse {
  data: AcpAgentRecord[];
  meta: { pagination: { page: number; pageCount: number; total: number } };
}

export async function resolveTarget(
  target: Target,
  deps: ResolverDeps,
): Promise<ResolvedTarget> {
  if (target.kind === "address") {
    return { address: target.value, name: null };
  }

  const wanted = target.value.toLowerCase();

  // Paginate through all agents sorted by aGDP descending (same order as
  // decode-candidates) so high-value targets like Axelrod appear on page 1.
  let page = 1;
  while (true) {
    const url =
      `${ACP_API_BASE}/agents` +
      `?pagination%5Bpage%5D=${page}` +
      `&pagination%5BpageSize%5D=${PAGE_SIZE}` +
      `&sort=grossAgenticAmount:desc`;

    const res = await deps.fetch(url);
    if (!res.ok) {
      throw new Error(`ACP API returned ${(res as Response).status}`);
    }

    const body = (await res.json()) as AcpAgentsResponse;
    const match = body.data.find((a) => a.name.toLowerCase() === wanted);
    if (match) {
      return { address: match.walletAddress, name: match.name };
    }

    if (page >= body.meta.pagination.pageCount) break;
    page++;
  }

  throw new Error(`@${target.value} not found in ACP registry`);
}
