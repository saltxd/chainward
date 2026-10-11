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
  // The root layout's title template appends " | ChainWard".
  const title = `Should you pay ${name}? AI agent on Base`;
  const acp = agent.acp?.revenue
    ? ` Virtuals reports ${agent.acp.jobs.toLocaleString('en-US')} jobs and $${Math.round(agent.acp.revenue).toLocaleString('en-US')} in revenue.`
    : '';
  const description = `${name} on Base: its wallet activity, read from the chain.${acp} Free check: Pay or Hold, and why.`;

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
