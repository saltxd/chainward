import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainWard — AI Agent Monitoring for Base',
  description:
    'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base. See everything your agents do on-chain.',
  metadataBase: new URL('https://chainward.ai'),
  icons: {
    icon: '/favicon.ico',
    apple: '/chainward-logo-180.png',
  },
  openGraph: {
    title: 'ChainWard — AI Agent Monitoring for Base',
    description:
      'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base.',
    siteName: 'ChainWard',
    url: 'https://chainward.ai',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: 'ChainWard — AI Agent Monitoring for Base',
    description:
      'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base.',
    images: ['/chainward-og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
