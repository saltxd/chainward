import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description:
    'Create a ChainWard account to start monitoring your AI agent wallets on Base. Free during beta.',
  alternates: { canonical: 'https://chainward.ai/register' },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
