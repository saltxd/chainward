import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentDetailClient } from './agent-detail-client';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchAgent(slug: string) {
  const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${slug}`, {
    next: { revalidate: 120 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const agent = await fetchAgent(slug);
  if (!agent) return { title: 'Agent not found — ChainWard' };

  const name = agent.agentName ?? slug;
  const score = agent.health?.score;
  const title = score != null
    ? `${name} — Health ${score}/100 — ChainWard`
    : `${name} — On-chain activity — ChainWard`;
  const description = agent.acp?.revenue
    ? `${name} on Base. Revenue $${Math.round(agent.acp.revenue).toLocaleString()}, ${agent.acp.jobs} jobs, ${score ?? '—'}/100 health.`
    : `${name} on Base. Live wallet activity, gas analytics, alerts.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function AgentPage({ params }: PageProps) {
  const { slug } = await params;
  const agent = await fetchAgent(slug);
  if (!agent) notFound();
  return <AgentDetailClient agent={agent} />;
}
