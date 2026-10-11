import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/siteCopy';

// The page itself is a client component; metadata lives here. No price in the
// copy: prices are runtime config (GET /api/brief/config), never hardcoded.
const title = 'Intel Brief: a written on-chain investigation of any Base wallet';
const description =
  'Point ChainWard at any Base agent or wallet: a full on-chain investigation, fund flows traced and public claims tested against the chain, delivered as a written brief within 48 hours. Paid in USDC on Base.';
const url = 'https://chainward.ai/request-brief';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, siteName: 'ChainWard', type: 'website', images: [DEFAULT_OG_IMAGE] },
  twitter: { card: 'summary_large_image', site: '@chainwardai', title, description, images: [DEFAULT_OG_IMAGE.url] },
};

export default function RequestBriefLayout({ children }: { children: React.ReactNode }) {
  return children;
}
