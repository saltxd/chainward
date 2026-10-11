import { isAgentSlug } from '@/lib/params';
import { AgentCard, DefaultCard } from '@/lib/og/cards';
import { agentCard } from '@/lib/og/model';
import { cardResponse } from '@/lib/og/render';

export const alt = 'Should you pay this AI agent? ChainWard';
export const size = { width: 1200, height: 675 };
export const contentType = 'image/png';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';
const CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

interface AgentPayload {
  slug?: string;
  agentName?: string | null;
  walletAddress?: string;
}

async function fetchAgent(slug: string): Promise<AgentPayload | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: AgentPayload };
    return body.data?.walletAddress ? body.data : null;
  } catch {
    return null;
  }
}

/** The /base/<slug> share card in the paper look; the site card when the agent can't be read. */
export default async function og({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = isAgentSlug(slug) ? await fetchAgent(slug) : null;
  if (!agent?.walletAddress) return cardResponse(<DefaultCard />, size, CACHE);
  const card = agentCard({
    name: agent.agentName ?? agent.slug ?? slug,
    walletAddress: agent.walletAddress,
    slug: agent.slug ?? slug,
  });
  return cardResponse(<AgentCard card={card} />, size, CACHE);
}
