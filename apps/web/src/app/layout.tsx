import type { Metadata, Viewport } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Instrument_Serif,
  Fraunces,
  Newsreader,
} from 'next/font/google';
import './globals.css';
import '../styles/v2-tokens.css';
import '../styles/press.css';
import { Analytics } from '@/components/press/Analytics';

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
    default: 'ChainWard — on-chain risk checks for any Base address',
    template: '%s | ChainWard',
  },
  description:
    'Paste any Base address and get every risk flag we can prove on-chain: dormant wallets, stranded USDC, concentrated counterparties, factory clones, claims the chain doesn’t back. Each flag is tied to its transactions. Free and public; flagged reports are attested on Base. Never a safety verdict.',
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
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/chainward-mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/chainward-mark-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/chainward-mark-180.png',
  },
  openGraph: {
    title: 'ChainWard — on-chain risk checks for any Base address',
    description:
      'Paste any Base address and get every risk flag we can prove on-chain: dormant wallets, stranded USDC, concentrated counterparties, factory clones, claims the chain doesn’t back. Each flag is tied to its transactions. Free and public; flagged reports are attested on Base. Never a safety verdict.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai',
    type: 'website',
    images: [{ url: '/chainward-og-press.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'ChainWard — on-chain risk checks for any Base address',
    description:
      'Paste any Base address and get every risk flag we can prove on-chain: dormant wallets, stranded USDC, concentrated counterparties, factory clones, claims the chain doesn’t back. Each flag is tied to its transactions. Free and public; flagged reports are attested on Base. Never a safety verdict.',
    images: ['/chainward-og-press.png'],
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
  // First-party Umami via the same-origin /a proxy. The public pages are
  // statically prerendered, so reading env here would bake CI's (empty) env
  // into the HTML forever. <Analytics /> instead fetches /a/meta at runtime —
  // a force-dynamic route that reads pod env per request — and injects the
  // tracker client-side. Pages stay static; config stays runtime-changeable.
  return (
    <html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${fraunces.variable} ${newsreader.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
