import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description:
    'Connect your wallet and sign in to ChainWard. Monitor your AI agent wallets on Base with real-time alerts.',
  alternates: { canonical: 'https://chainward.ai/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
