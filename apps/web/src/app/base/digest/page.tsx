import type { Metadata } from 'next';
import { DigestClient, type DigestData } from './digest-client';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface HeadlineNumbers {
  totalRevenue: number;
  totalGas: number;
  netProfit: number;
  activeAgents: number;
  totalJobs: number;
  newAgents: number;
  wow: {
    revenueChange: number | null;
    gasChange: number | null;
    profitChange: number | null;
    activeAgentsChange: number | null;
    jobsChange: number | null;
  };
}

interface MetaDigest {
  week_start: string;
  week_end: string;
  generated_at: string;
  headline: HeadlineNumbers | null;
}

async function fetchLatestDigest(): Promise<MetaDigest | null> {
  try {
    const res = await fetch(`${API_URL}/api/digest/latest`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const digest = await fetchLatestDigest();

  const headline = digest?.headline;
  const hasData = digest != null && headline != null;

  const description = hasData
    ? `$${headline.totalRevenue.toLocaleString()} revenue | ${headline.activeAgents} active agents | ${headline.totalJobs.toLocaleString()} jobs — Weekly intelligence on the Base agent economy`
    : 'Weekly intelligence on the Base agent economy';

  return {
    title: 'Weekly Agent Economy Digest — ChainWard',
    description,
    alternates: { canonical: 'https://chainward.ai/base/digest' },
    keywords: [
      'AI agent economy',
      'Base agent digest',
      'weekly agent report',
      'onchain agent analytics',
      'autonomous agent revenue',
    ],
    openGraph: {
      title: 'Base Agent Economy — Weekly Digest',
      description,
      url: 'https://chainward.ai/base/digest',
      type: 'article',
      images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Base Agent Economy — Weekly Digest',
      description,
      images: ['/chainward-og.png'],
    },
  };
}

export default async function DigestPage() {
  let initialData: DigestData | null = null;
  try {
    const res = await fetch(`${API_URL}/api/digest/latest`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const json = await res.json();
      initialData = (json.data as DigestData) ?? null;
    }
  } catch {
    // Render client with no initial data — it will fetch on mount
  }

  return <DigestClient initialData={initialData} />;
}
