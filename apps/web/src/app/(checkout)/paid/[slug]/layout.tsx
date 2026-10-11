import type { Metadata } from 'next';
import { isAgentSlug } from '@/lib/params';
import { DEFAULT_OG_IMAGE } from '@/lib/siteCopy';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// The root title template adds "| ChainWard".
const FALLBACK: Metadata = { title: 'Dataset', robots: { index: false } };

// The page itself is client-rendered; the title and share card for a paid file come from here.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isAgentSlug(slug)) return FALLBACK;
  try {
    const res = await fetch(`${API_URL}/api/paid/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as { data?: { title: string; description: string; priceUsdc: number } };
    if (!json.data) return { title: 'Dataset' };
    const title = `${json.data.title}: ${json.data.priceUsdc} USDC`;
    const { description } = json.data;
    const url = `https://chainward.ai/paid/${slug}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: 'ChainWard', type: 'website', images: [DEFAULT_OG_IMAGE] },
      twitter: { card: 'summary_large_image', site: '@chainwardai', title, description, images: [DEFAULT_OG_IMAGE.url] },
    };
  } catch {
    return { title: 'Dataset' };
  }
}

export default function PaidLayout({ children }: { children: React.ReactNode }) {
  return children;
}
