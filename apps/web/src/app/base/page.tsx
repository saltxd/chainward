import type { Metadata } from 'next';
import { ObservatoryPage } from './observatory-page';
import { getObservatoryInitial, getObservatoryOverview } from '@/lib/observatoryServer';
import { observatoryDescription } from '@/lib/observatory';

// Rendered per request (the build can't reach the API); each read is cached
// (summary and lists 5 min, wire 1 min, x402 board 30 min).
export const dynamic = 'force-dynamic';

const TITLE = 'Base Agent Observatory: which AI agents on Base moved money';
const SHORT_TITLE = 'Base Agent Observatory | ChainWard';
const STATIC_DESCRIPTION =
  'Named AI agent wallets on Base, mostly Virtuals, plus ERC-8004 registrations: which of them moved money this week, the latest transfers, and the top x402 sellers.';

export async function generateMetadata(): Promise<Metadata> {
  const description = observatoryDescription(await getObservatoryOverview()) ?? STATIC_DESCRIPTION;

  return {
    title: TITLE,
    description,
    alternates: { canonical: 'https://chainward.ai/base' },
    keywords: [
      'AI agent wallets Base',
      'Virtuals agents on-chain activity',
      'ERC-8004 agents Base',
      'Base Agent Observatory',
      'x402 sellers Base',
    ],
    openGraph: {
      title: SHORT_TITLE,
      description,
      url: 'https://chainward.ai/base',
      type: 'website',
      images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: SHORT_TITLE,
      description,
      images: ['/chainward-og-card.png'],
    },
  };
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Base Agent Observatory',
  description:
    'Named AI agent wallets on Base and the transfers we record for them: wallets active per day, transfers per day, and the most active agents of the week.',
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
    a: 'A free public page that follows AI agent wallets on Base. Most are Virtuals agents. The rest are wallets registered under ERC-8004, plus a few we added by hand. An ERC-8004 registration with no name only shows up here while it is moving money.',
  },
  {
    q: 'What counts as active?',
    a: 'A wallet is active when we recorded a transfer in or out of it in that window. Transfers of known spam tokens and lookalike symbols are left out. Most wallets on the list are quiet on most days.',
  },
  {
    q: 'How fresh is it?',
    a: 'Counts, lists and the wire update every few minutes. Not every wallet on the list is on our live feed, so a quiet row is not proof that a wallet is idle.',
  },
  {
    q: 'What is the x402 sellers list?',
    a: 'The top of our weekly x402 seller board: the largest x402 sellers on Base by 7-day volume (x402scan’s ranking), each with a verdict on whether its buyers’ money traces back to the seller. The full board and how to read it are at chainward.ai/x402.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Transfers are read from Base mainnet. Agent names come from Virtuals, from ERC-8004 registrations, and from our own labels. The status line at the top of every page says whether readings currently come from our own node or a public Base RPC.',
  },
];

export default async function BasePage() {
  const initial = await getObservatoryInitial();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ObservatoryPage initial={initial}>
        {/* Passed as children so it sits inside the paper shell, above the colophon. */}
        <section className="obs-faq">
          <span className="press-label">About the observatory</span>
          <div className="obs-faq-grid">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="obs-faq-item">
                <h3 className="obs-faq-q press-display">{item.q}</h3>
                <p className="obs-faq-a">{item.a}</p>
              </div>
            ))}
          </div>
          <style>{`
            .obs-faq { padding: 44px 0 8px; }
            .obs-faq-grid {
              margin-top: 20px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 32px 48px;
            }
            @media (max-width: 720px) {
              .obs-faq-grid { grid-template-columns: 1fr; }
            }
            .obs-faq-q {
              margin: 0 0 8px;
              font-size: 19px;
              line-height: 1.2;
            }
            .obs-faq-a {
              margin: 0;
              font-family: var(--font-text);
              font-size: 15.5px;
              line-height: 1.6;
              color: var(--ink-soft);
            }
          `}</style>
        </section>
      </ObservatoryPage>
    </>
  );
}
