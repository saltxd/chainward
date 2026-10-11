import type { Metadata } from 'next';
import { FREE_WALLET_LIMIT } from '@/lib/watch';

export const metadata: Metadata = {
  title: 'Create Account',
  description: `Create a ChainWard account to start monitoring your AI agent wallets on Base. Free for up to ${FREE_WALLET_LIMIT} wallets.`,
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
