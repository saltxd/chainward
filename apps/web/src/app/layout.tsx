import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

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

export const metadata: Metadata = {
  title: {
    default: 'ChainWard — Monitoring for agents you actually own',
    template: '%s | ChainWard',
  },
  description:
    'Coinbase closed my CDP account. I rebuilt everything with zero vendor lock-in. Real-time alerts for AI agent wallets on Base — 7 alert types, Discord & Telegram delivery in <30s. Free tier, 3 agents.',
  metadataBase: new URL('https://chainward.ai'),
  alternates: { canonical: 'https://chainward.ai/' },
  robots: { index: true, follow: true },
  keywords: [
    'AI agent monitoring',
    'Base chain monitoring',
    'agent wallet tracker',
    'crypto agent alerts',
    'Discord alerts crypto',
    'onchain agent monitoring',
    'autonomous agent monitoring',
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
    title: 'ChainWard — Monitoring for agents you actually own',
    description:
      'Coinbase closed my CDP account. I rebuilt everything with zero vendor lock-in. Real-time alerts for AI agent wallets on Base — 7 alert types, Discord & Telegram delivery in <30s. Free tier, 3 agents.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'ChainWard — Monitoring for agents you actually own',
    description:
      'Coinbase closed my CDP account. I rebuilt everything with zero vendor lock-in. Real-time alerts for AI agent wallets on Base — 7 alert types, Discord & Telegram delivery in <30s. Free tier, 3 agents.',
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
    <html lang="en" className={`dark scroll-smooth ${inter.variable} ${jetbrainsMono.variable}`}>
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
