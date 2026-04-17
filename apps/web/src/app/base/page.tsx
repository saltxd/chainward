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

const FAQ_ITEMS = [
  {
    q: 'What is the Base Agent Observatory?',
    a: 'The Base Agent Observatory is a free, public dashboard that tracks autonomous AI agent wallets operating on Base chain in real time. It monitors transaction volumes, gas analytics, portfolio values, and agent health scores across hundreds of wallets from frameworks like elizaOS, Olas, Virtuals GAME, AgentKit, and more.',
  },
  {
    q: 'What data does the observatory track?',
    a: 'Live feeds of agent transactions (updated every 60 seconds), daily transaction volume and gas spend charts over 30 days, agent leaderboards ranked by activity, gas spend, portfolio value, and health score, and fleet-wide statistics including total agents tracked, 24h and 7d activity, and gas burned in ETH and USD.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Data is sourced directly from Base mainnet. ChainWard runs its own sentinel node and cross-checks against Blockscout. Transaction data, gas costs, and token transfers are captured in real time as they occur on-chain.',
  },
  {
    q: 'Can I monitor my own agents?',
    a: 'Yes. ChainWard offers private monitoring with real-time alerts for your own agent wallets. Set up failed-transaction, gas-spike, balance-drop, and inactivity alerts delivered to Discord, Telegram, or webhooks. Free during beta.',
  },
];

export default function BasePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ObservatoryPage />

      {/* Server-rendered FAQ — gives crawlers indexable text content */}
      <section
        className="v2-shell"
        style={{
          paddingTop: 80,
          paddingBottom: 80,
          borderTop: '1px solid var(--line)',
          background: 'var(--bg)',
        }}
      >
        <h2
          className="display"
          style={{
            fontSize: 32,
            color: 'var(--fg)',
            margin: 0,
            maxWidth: 600,
          }}
        >
          About the{' '}
          <span className="serif" style={{ color: 'var(--phosphor)' }}>
            observatory.
          </span>
        </h2>
        <div
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 32,
          }}
          className="v2-obs-faq-grid"
        >
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <h3
                style={{
                  fontSize: 15,
                  color: 'var(--fg)',
                  marginBottom: 8,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                {item.q}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--fg-dim)',
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {item.a}
              </p>
            </div>
          ))}
        </div>
        <style>{`
          @media (max-width: 720px) {
            .v2-obs-faq-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>
    </>
  );
}
