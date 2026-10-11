import type { Metadata, Viewport } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Instrument_Serif,
  Newsreader,
} from 'next/font/google';
import './globals.css';
import '../styles/v2-tokens.css';
import '../styles/press.css';
import { Analytics } from '@/components/press/Analytics';
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/siteCopy';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  // Dashboard only: don't preload it on every public page.
  preload: false,
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
  preload: false,
});

// The public "dossier" surface's one serif: a screen-tuned news face for
// headlines and long-form text alike (the opsz axis picks the display cut at
// headline sizes), with JetBrains Mono for chain data. Dashboard keeps Inter.
const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-reader',
  display: 'swap',
});

// No canonical (or og:url) here: every page inherits the root metadata, so a
// canonical set here told Google that each page without its own was the home
// page. The home page and each indexable page set their own.
export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: '%s | ChainWard',
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
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
      { url: '/chainward-mark.svg', type: 'image/svg+xml' },
      { url: '/chainward-mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/chainward-mark-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/chainward-mark-180.png',
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: 'ChainWard',
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
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
    <html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${newsreader.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
