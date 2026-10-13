import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAgentSlug } from '@/lib/params';
import { DEFAULT_OG_IMAGE } from '@/lib/siteCopy';
import { CheckoutShell } from '../../(checkout)/checkout-shell';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface PaidMeta {
  title: string;
  description: string;
  priceUsdc: number;
  /** Set when the dataset is off sale (api lib/withdrawnDatasets.ts). */
  withdrawn?: { reason: string } | null;
}

/**
 * 'missing' only when the slug is malformed or the API says there is no such
 * file; null when the API couldn't be reached, so the page still renders and
 * shows its own error instead of a false 404.
 */
async function loadPaidFile(slug: string): Promise<PaidMeta | 'missing' | null> {
  if (!isAgentSlug(slug)) return 'missing';
  try {
    const res = await fetch(`${API_URL}/api/paid/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PaidMeta };
    return json.data ?? 'missing';
  } catch {
    return null;
  }
}

// The page itself is client-rendered; the title and share card for a paid file
// come from here. The root title template adds "| ChainWard".
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const file = await loadPaidFile(slug);
  if (file === 'missing') return { title: 'Dataset not found', robots: { index: false } };
  if (!file) return { title: 'Dataset', robots: { index: false } };
  // A withdrawn dataset keeps its page but advertises no price and stays out of search.
  const title = file.withdrawn ? `${file.title} (withdrawn from sale)` : `${file.title}: ${file.priceUsdc} USDC`;
  const { description } = file;
  const url = `https://chainward.ai/paid/${slug}`;
  return {
    title,
    ...(file.withdrawn ? { robots: { index: false } } : {}),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'ChainWard', type: 'website', images: [DEFAULT_OG_IMAGE] },
    twitter: { card: 'summary_large_image', site: '@chainwardai', title, description, images: [DEFAULT_OG_IMAGE.url] },
  };
}

export default async function PaidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // An unknown slug is a real 404, not a 200 page that says "Not found". This
  // layout sits outside the (checkout) group on purpose: inside it, the
  // client-only wallet provider would swallow the 404 into a 200 shell.
  if ((await loadPaidFile(slug)) === 'missing') notFound();
  return <CheckoutShell>{children}</CheckoutShell>;
}
