'use client';

import { useSession, logout } from '@/lib/auth-client';
import { useDisconnect } from 'wagmi';
import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/overview': 'Overview',
  '/agents': 'Agents',
  '/transactions': 'Transactions',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { disconnect } = useDisconnect();

  const title = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? '';

  const walletAddress = session?.user?.walletAddress;
  const truncated = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  async function handleDisconnect() {
    try { await logout(); } catch {}
    try { disconnect(); } catch {}
    // Hard redirect to fully reset wagmi/RainbowKit client state
    window.location.href = '/login';
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="flex items-center gap-4">
        {truncated && (
          <span className="font-mono text-sm text-muted-foreground">{truncated}</span>
        )}
        <button
          onClick={handleDisconnect}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Disconnect
        </button>
      </div>
    </header>
  );
}
