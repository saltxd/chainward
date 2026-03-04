import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainWard — AI Agent Monitoring for Base',
  description:
    'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base. See everything your agents do on-chain.',
  metadataBase: new URL('https://chainward.ai'),
  openGraph: {
    title: 'ChainWard — AI Agent Monitoring for Base',
    description:
      'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base.',
    siteName: 'ChainWard',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainWard — AI Agent Monitoring for Base',
    description:
      'Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents on Base.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
