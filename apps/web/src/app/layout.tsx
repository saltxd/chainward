import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainWard',
  description: 'Observability and control plane for autonomous AI agents on-chain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
