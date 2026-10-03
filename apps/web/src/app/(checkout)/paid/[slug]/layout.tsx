import type { Metadata } from 'next';
import { isAgentSlug } from '@/lib/params';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// The page itself is client-rendered; the title/OG for a paid file come from here.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isAgentSlug(slug)) return { title: 'Dataset — ChainWard', robots: { index: false } };
  try {
    const res = await fetch(`${API_URL}/api/paid/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Dataset — ChainWard', robots: { index: false } };
    const json = (await res.json()) as { data?: { title: string; description: string; priceUsdc: number } };
    if (!json.data) return { title: 'Dataset — ChainWard' };
    const title = `${json.data.title} — ${json.data.priceUsdc} USDC`;
    return {
      title,
      description: json.data.description,
      alternates: { canonical: `https://chainward.ai/paid/${slug}` },
      openGraph: { title, description: json.data.description, url: `https://chainward.ai/paid/${slug}` },
      twitter: { card: 'summary_large_image', title, description: json.data.description },
    };
  } catch {
    return { title: 'Dataset — ChainWard' };
  }
}

export default function PaidLayout({ children }: { children: React.ReactNode }) {
  return children;
}
