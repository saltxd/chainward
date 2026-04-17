'use client';

import dynamic from 'next/dynamic';
import { PageShell } from '@/components/v2';

const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <PageShell>
        <div className="v2-auth-shell">{children}</div>
        <style>{`
          .v2-auth-shell {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 48px 20px;
          }
        `}</style>
      </PageShell>
    </Web3Provider>
  );
}
