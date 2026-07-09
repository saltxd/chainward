'use client';

import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/ui/toast';

// Web3Provider is client-only (wagmi/RainbowKit). Mounting it here means the
// checkout route works for logged-OUT visitors arriving from a link/tweet —
// they can connect + sign in inline without bouncing through /login.
const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <ToastProvider>
        <div className="press">{children}</div>
      </ToastProvider>
    </Web3Provider>
  );
}
