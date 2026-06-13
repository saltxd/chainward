import type { Metadata } from 'next';

// /wallet/:address redirects to /report/:address; keep the legacy path noindexed.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function WalletAddressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
