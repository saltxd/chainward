'use client';

import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/ui/toast';
import './checkout.css';

// Web3Provider is client-only (wagmi/RainbowKit). Mounting it here means the
// checkout routes work for logged-OUT visitors arriving from a link/tweet:
// they can connect + sign in inline without bouncing through /login.
const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

/**
 * Wallet + toast providers on the press surface, for /request-brief and
 * /paid/<slug>. Everything inside renders client-side only, so a route that
 * must answer 404 decides that in a server layout above this shell.
 */
export function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <ToastProvider>
        <div className="press">{children}</div>
      </ToastProvider>
    </Web3Provider>
  );
}
