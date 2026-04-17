'use client';

import { useSession, logout } from '@/lib/auth-client';
import { useDisconnect } from 'wagmi';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  onMenuToggle?: () => void;
}

const pageTags: Record<string, string> = {
  '/overview': 'overview',
  '/agents': 'agents',
  '/transactions': 'transactions',
  '/alerts': 'alerts',
  '/settings': 'settings',
};

export function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { disconnect } = useDisconnect();

  const tag =
    Object.entries(pageTags).find(([path]) => pathname.startsWith(path))?.[1] ?? '';

  const walletAddress = session?.user?.walletAddress;
  const truncated = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  async function handleDisconnect() {
    try {
      await logout();
    } catch {}
    try {
      disconnect();
    } catch {}
    window.location.href = '/';
  }

  return (
    <header
      className="flex h-12 items-center justify-between px-4 md:px-6"
      style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg-1)',
        paddingTop: 'env(safe-area-inset-top)',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          aria-label="Toggle menu"
          className="md:hidden flex min-h-[40px] min-w-[40px] flex-col items-center justify-center gap-[5px]"
          style={{ color: 'var(--fg-dim)' }}
        >
          <span style={{ display: 'block', height: 2, width: 20, background: 'currentColor' }} />
          <span style={{ display: 'block', height: 2, width: 20, background: 'currentColor' }} />
          <span style={{ display: 'block', height: 2, width: 20, background: 'currentColor' }} />
        </button>

        {tag && (
          <span
            style={{
              color: 'var(--muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: 'var(--fg-dim)' }}>[ </span>
            <span style={{ color: 'var(--phosphor)' }}>{tag}</span>
            <span style={{ color: 'var(--fg-dim)' }}> ]</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {truncated && (
          <span
            className="hidden md:inline"
            style={{
              color: 'var(--fg-dim)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {truncated}
          </span>
        )}
        <button
          onClick={handleDisconnect}
          className="min-h-[40px] px-3 flex items-center justify-center"
          style={{
            color: 'var(--fg-dim)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fg-dim)')}
        >
          ./disconnect
        </button>
      </div>
    </header>
  );
}
