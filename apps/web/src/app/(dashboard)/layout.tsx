'use client';

import dynamic from 'next/dynamic';
import {
  Sidebar,
  MobileDrawer,
  MobileRegisterFab,
  useMobileSidebar,
} from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ToastProvider } from '@/components/ui/toast';

const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { open, toggle, close } = useMobileSidebar();

  return (
    <Web3Provider>
      <ToastProvider>
        <div className="flex h-screen">
          {/* Desktop sidebar — hidden on mobile */}
          <Sidebar />

          {/* Mobile slide-out drawer */}
          <MobileDrawer open={open} onClose={close} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onMenuToggle={toggle} />
            <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</main>
          </div>

          {/* Mobile floating action button for "Register Agent" */}
          <MobileRegisterFab />
        </div>
      </ToastProvider>
    </Web3Provider>
  );
}
