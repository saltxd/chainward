'use client';

import { useSession, logout } from '@/lib/auth-client';
import { useDisconnect } from 'wagmi';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuToggle?: () => void;
}

const pageTitles: Record<string, string> = {
  '/overview': 'Overview',
  '/agents': 'Agents',
  '/transactions': 'Transactions',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Header({ onMenuToggle }: HeaderProps) {
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
    window.location.href = '/';
  }

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b border-border px-4 md:px-6',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      {/* Left side: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu button — mobile only */}
        <button
          onClick={onMenuToggle}
          aria-label="Toggle menu"
          className={cn(
            'relative z-10 flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-[5px] md:hidden',
            'text-muted-foreground transition-colors hover:text-foreground',
          )}
        >
          <span className="block h-[2px] w-5 rounded-full bg-current" />
          <span className="block h-[2px] w-5 rounded-full bg-current" />
          <span className="block h-[2px] w-5 rounded-full bg-current" />
        </button>

        <h1 className="text-sm font-medium">{title}</h1>
      </div>

      {/* Right side: wallet address (desktop only) + disconnect */}
      <div className="flex items-center gap-4">
        {truncated && (
          <span className="hidden font-mono text-sm text-muted-foreground md:inline">
            {truncated}
          </span>
        )}
        <button
          onClick={handleDisconnect}
          className={cn(
            'relative z-10 min-h-[44px] min-w-[44px] cursor-pointer px-2',
            'text-sm text-muted-foreground transition-colors hover:text-foreground',
            'flex items-center justify-center',
          )}
        >
          Disconnect
        </button>
      </div>
    </header>
  );
}
