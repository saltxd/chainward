'use client';

import dynamic from 'next/dynamic';

const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </Web3Provider>
  );
}
