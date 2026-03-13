import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallet Lookup — Free Base Wallet Activity Viewer',
  description:
    'Paste any wallet address to see recent transactions, token balances, and on-chain activity on Base. No sign-up required.',
  alternates: { canonical: 'https://chainward.ai/wallet' },
  openGraph: {
    title: 'Wallet Lookup — Free Base Wallet Activity Viewer',
    description:
      'Paste any wallet address to see recent transactions, token balances, and on-chain activity on Base.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai/wallet',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'Wallet Lookup — Free Base Wallet Activity Viewer',
    description:
      'Paste any wallet address to see recent transactions, token balances, and on-chain activity on Base.',
    images: ['/chainward-og.png'],
  },
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
