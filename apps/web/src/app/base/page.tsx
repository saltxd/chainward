import type { Metadata } from 'next';
import { ObservatoryPage } from './observatory-page';

export const metadata: Metadata = {
  title: 'Base Agent Observatory — Live AI Agent Activity on Base',
  description:
    'Track AI agent activity on Base in real time. Transaction volumes, gas analytics, and agent leaderboards. Monitoring autonomous agents on Base chain.',
  alternates: { canonical: 'https://chainward.ai/base' },
  keywords: [
    'AI agent monitoring Base',
    'agent wallet analytics',
    'autonomous agent transactions Base chain',
    'Base Agent Observatory',
    'onchain agent tracking',
  ],
  openGraph: {
    title: 'Base Agent Observatory | ChainWard',
    description:
      'Real-time intelligence on AI agent activity on Base. Tracking autonomous agents.',
    url: 'https://chainward.ai/base',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Base Agent Observatory | ChainWard',
    description:
      'Real-time intelligence on AI agent activity on Base. Tracking autonomous agents.',
    images: ['/chainward-og.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Base Agent Observatory',
  description:
    'Real-time dataset of AI agent activity on Base chain, including transaction volumes, gas analytics, and agent leaderboards.',
  url: 'https://chainward.ai/base',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  creator: {
    '@type': 'Organization',
    name: 'ChainWard',
    url: 'https://chainward.ai',
  },
  temporalCoverage: '2026/..',
  distribution: {
    '@type': 'DataDownload',
    encodingFormat: 'application/json',
    contentUrl: 'https://api.chainward.ai/api/observatory',
  },
};

export default function BasePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ObservatoryPage />
      {/* Server-rendered FAQ — gives crawlers indexable text content */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-12">
        <h2 className="text-xl font-bold text-white">About the Base Agent Observatory</h2>
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-gray-500">
          <div>
            <h3 className="font-medium text-gray-300">What is the Base Agent Observatory?</h3>
            <p className="mt-1">
              The Base Agent Observatory is a free, public dashboard that tracks autonomous AI agent
              wallets operating on Base chain in real time. It monitors transaction volumes, gas
              analytics, portfolio values, and agent health scores across hundreds of wallets from
              frameworks like elizaOS, Olas, Virtuals GAME, AgentKit, and more.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-300">What data does the observatory track?</h3>
            <p className="mt-1">
              The observatory provides live feeds of agent transactions (updated every 60 seconds),
              daily transaction volume and gas spend charts over 30 days, agent leaderboards ranked
              by activity, gas spend, portfolio value, and health score, and fleet-wide statistics
              including total agents tracked, 24-hour and 7-day activity, and gas burned in ETH and
              USD.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-300">Where does the data come from?</h3>
            <p className="mt-1">
              All data is sourced directly from Base mainnet via Alchemy webhooks and indexed by
              ChainWard. Transaction data, gas costs, and token transfers are captured in real time
              as they occur on-chain.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-300">Can I monitor my own agents?</h3>
            <p className="mt-1">
              Yes. ChainWard offers private monitoring with real-time alerts for your own agent
              wallets. Set up failed-transaction, gas-spike, balance-drop, and inactivity alerts
              delivered to Discord, Telegram, or webhooks. Free during beta at chainward.ai.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
