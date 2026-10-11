import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentDetailClient } from './agent-detail-client';
import { isAgentSlug } from '@/lib/params';
import { agentFetchOutcome, type AgentFetchOutcome } from '@/lib/observatory';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface PageProps {
  params: Promise<{ slug: string }>;
}

type Agent = Parameters<typeof AgentDetailClient>[0]['agent'];

async function fetchAgent(slug: string): Promise<AgentFetchOutcome<Agent>> {
  if (!isAgentSlug(slug)) return { kind: 'missing' };
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${encodeURIComponent(slug)}`, {
      next: { revalidate: 120 },
      // An old slug answers 301 + movedTo; read it instead of following it, so the
      // browser lands on the current URL.
      redirect: 'manual',
    });
    const body = await res.json().catch(() => null);
    return agentFetchOutcome<Agent>(res.status, body);
  } catch {
    return { kind: 'missing' };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await fetchAgent(slug);
  if (outcome.kind !== 'agent') return { title: 'Agent not found' };
  const agent = outcome.agent;

  const name = agent.agentName ?? slug;
  const score = agent.health?.score;
  // The root layout's title template appends " | ChainWard".
  const title = score != null
    ? `${name} — AI agent on Base, health ${score}/100`
    : `${name} — AI agent on Base, on-chain activity`;
  const description = agent.acp?.revenue
    ? `${name} on Base. Revenue $${Math.round(agent.acp.revenue).toLocaleString()}, ${agent.acp.jobs} jobs, ${score ?? '—'}/100 health.`
    : `${name} on Base. Live wallet activity, gas analytics, alerts.`;

  const canonical = `https://chainward.ai/base/${agent.slug ?? slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: canonical },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function AgentPage({ params }: PageProps) {
  const { slug } = await params;
  const outcome = await fetchAgent(slug);
  // Old slugs (e.g. the mangled "aptain-ackie") move permanently to the current one.
  if (outcome.kind === 'moved') permanentRedirect(`/base/${outcome.slug}`);
  if (outcome.kind !== 'agent') notFound();
  return <AgentDetailClient agent={outcome.agent} />;
}
