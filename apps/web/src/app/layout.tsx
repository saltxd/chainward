import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Instrument_Serif, Fraunces } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import '../styles/v2-tokens.css';

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
  themeColor: '#050508',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <Script
          src="/u/script.js"
          data-website-id="bd27109d-11b2-4a0e-b621-b4456297c035"
          data-host-url="/u"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
