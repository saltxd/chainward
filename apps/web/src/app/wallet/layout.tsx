import type { Metadata } from 'next';

// /wallet redirects to the Risk-Check home page; keep it out of the index.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
