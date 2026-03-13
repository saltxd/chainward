export const metadata = {
  title: 'CLI',
  description: 'ChainWard CLI reference. Monitor agent wallets, view transactions, manage alerts, and watch live activity from the terminal. Install with npm i -g @chainward/cli.',
  alternates: { canonical: 'https://chainward.ai/docs/cli' },
  openGraph: {
    title: 'CLI — ChainWard Docs',
    description: 'Monitor AI agent wallets from the terminal with the ChainWard CLI.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

export default function CliLayout({ children }: { children: React.ReactNode }) {
  return children;
}
