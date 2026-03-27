import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ChainWard — Real-time monitoring for AI agent wallets on Base',
    template: '%s | ChainWard',
  },
  description:
    'Monitor your AI agent wallets on Base. Real-time transaction indexing, 7 alert types, Discord & Telegram delivery, CLI, and API. Free during beta.',
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
    title: 'ChainWard — Real-time monitoring for AI agent wallets on Base',
    description:
      'Monitor your AI agent wallets on Base. Real-time transaction indexing, 7 alert types, Discord & Telegram delivery, CLI, and API. Free during beta.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'ChainWard — Real-time monitoring for AI agent wallets on Base',
    description:
      'Monitor your AI agent wallets on Base. Real-time transaction indexing, 7 alert types, Discord & Telegram delivery, CLI, and API. Free during beta.',
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
    <html lang="en" className="dark scroll-smooth">
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
