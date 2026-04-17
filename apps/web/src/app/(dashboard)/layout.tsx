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
import { PageShell, StatusTicker } from '@/components/v2';

const Web3Provider = dynamic(
  () => import('@/providers/web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false },
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { open, toggle, close } = useMobileSidebar();

  return (
    <Web3Provider>
      <ToastProvider>
        <PageShell>
          <StatusTicker />
          <div className="flex" style={{ minHeight: 'calc(100vh - 34px)' }}>
            <Sidebar />
            <MobileDrawer open={open} onClose={close} />

            <div className="flex flex-1 flex-col overflow-hidden">
              <Header onMenuToggle={toggle} />
              <main
                className="flex-1 overflow-y-auto"
                style={{
                  padding: '32px 32px 80px',
                  paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
                }}
              >
                {children}
              </main>
            </div>
          </div>
          <MobileRegisterFab />
        </PageShell>
      </ToastProvider>
    </Web3Provider>
  );
}
