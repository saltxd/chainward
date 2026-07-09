import type { Metadata, Viewport } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Instrument_Serif,
  Fraunces,
  Newsreader,
} from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import '../styles/v2-tokens.css';
import '../styles/press.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

// Body/reading face for the public "dossier" surface — a screen-tuned news
// serif for long-form decodes and reports. Paired with Fraunces (display) and
// JetBrains Mono (chain data). Dashboard keeps Inter.
const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-reader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ChainWard — the chain-verified source of truth for AI agents on Base',
    template: '%s | ChainWard',
  },
  description:
    'ChainWard is the chain-verified record of the AI agent economy on Base. We index every agent wallet from our own node — who is active, who is earning, who has gone quiet — and rank by real on-chain activity, not marketing totals. Live observatory, forensic on-chain decodes, weekly intel.',
  metadataBase: new URL('https://chainward.ai'),
  alternates: { canonical: 'https://chainward.ai/' },
  robots: { index: true, follow: true },
  keywords: [
    'AI agent analytics',
    'Base AI agents',
    'Virtuals ACP leaderboard',
    'onchain agent intelligence',
    'AI agent observatory',
    'agent wallet analysis',
    'on-chain decodes',
    'Base blockchain',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/chainward-logo-128.png', sizes: '128x128', type: 'image/png' },
    ],
    apple: '/chainward-logo-180.png',
  },
  openGraph: {
    title: 'ChainWard — the chain-verified source of truth for AI agents on Base',
    description:
      'The chain-verified record of AI agents on Base. We index every agent wallet from our own node and rank by real on-chain activity, not marketing totals. Live observatory, forensic on-chain decodes, weekly intel.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'ChainWard — the chain-verified source of truth for AI agents on Base',
    description:
      'The chain-verified record of AI agents on Base. We index every agent wallet from our own node and rank by real on-chain activity, not marketing totals. Live observatory, forensic on-chain decodes, weekly intel.',
    images: ['/chainward-og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Paper — the public surface is the front door. (Dashboard keeps its dark
  // page look; only the mobile browser-chrome tint is shared here.)
  themeColor: '#f2ede3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // First-party Umami, wired through the same-origin /a proxy. The website id
  // is read server-side (plain env, with NEXT_PUBLIC fallback) so ops can set
  // it without a rebuild. Tracker only loads in production and only when an id
  // is configured — local dev and self-hosters get nothing.
  const umamiWebsiteId =
    process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const analyticsOn = process.env.NODE_ENV === 'production' && !!umamiWebsiteId;

  return (
    <html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${fraunces.variable} ${newsreader.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        {analyticsOn && (
          <Script
            src="/a/script.js"
            data-website-id={umamiWebsiteId}
            data-host-url="/a"
            defer
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
