'use client';

import dynamic from 'next/dynamic';
import { PressShell } from '@/components/press';

const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <PressShell>{children}</PressShell>
    </Web3Provider>
  );
}
