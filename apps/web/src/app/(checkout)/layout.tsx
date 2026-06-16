'use client';

import dynamic from 'next/dynamic';
import { PageShell } from '@/components/v2';
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
        <PageShell>
          <div className="v2-checkout-shell">{children}</div>
          <style>{`
            .v2-checkout-shell {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 64px 20px 96px;
            }
          `}</style>
        </PageShell>
      </ToastProvider>
    </Web3Provider>
  );
}
