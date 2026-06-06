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
  const isAddress = target.kind === "address";
  const wanted = target.value.toLowerCase();

  // Match predicate differs by target kind:
  //  - handle  → match the agent NAME (case-insensitive)
  //  - address → REVERSE-LOOKUP the agent name by walletAddress (case-insensitive).
  //    Without this, an `0x…` decode never learns the agent's name → the deliverable
  //    slug degrades to the raw 40-char address (e.g. "0xd478…-on-chain"). The name is
  //    in the registry by wallet the whole time; we just have to look it up.
  const matches = (a: AcpAgentRecord): boolean =>
    isAddress
      ? a.walletAddress.toLowerCase() === wanted
      : a.name.toLowerCase() === wanted;

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
    const match = body.data.find(matches);
    if (match) {
      return { address: match.walletAddress, name: match.name };
    }

    if (page >= body.meta.pagination.pageCount) break;
    page++;
  }

  // An address that isn't in the registry is still directly decodable — return it
  // with no name (caller falls back to an address-derived slug). A handle that
  // isn't found is unusable, so that stays a hard error.
  if (isAddress) {
    return { address: target.value, name: null };
  }
  throw new Error(`@${target.value} not found in ACP registry`);
}
