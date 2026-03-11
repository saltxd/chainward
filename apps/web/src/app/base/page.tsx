import type { Metadata } from 'next';
import { ObservatoryPage } from './observatory-page';

export const metadata: Metadata = {
  title: 'Base Agent Observatory — Live AI Agent Activity on Base',
  description:
    'Track AI agent activity on Base in real time. Transaction volumes, gas analytics, and agent leaderboards. Monitoring autonomous agents on Base chain.',
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
    </>
  );
}
