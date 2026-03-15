export const metadata = {
  title: 'CLI — Monitor Agents from Your Terminal',
  description:
    'Install the ChainWard CLI to monitor AI agent wallets on Base from your terminal. List agents, view transactions, create alerts, and watch a live feed.',
  alternates: { canonical: 'https://chainward.ai/docs/cli' },
  openGraph: {
    title: 'CLI — Monitor Agents from Your Terminal | ChainWard',
    description:
      'Install the ChainWard CLI to monitor AI agent wallets on Base from your terminal.',
    url: 'https://chainward.ai/docs/cli',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image' as const,
    site: '@chainwardai',
    title: 'CLI — Monitor Agents from Your Terminal | ChainWard',
    description:
      'Install the ChainWard CLI to monitor AI agent wallets on Base from your terminal.',
    images: ['/chainward-og.png'],
  },
};

export default function CliLayout({ children }: { children: React.ReactNode }) {
  return children;
}
