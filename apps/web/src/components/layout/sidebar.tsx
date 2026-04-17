'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'overview', href: '/overview' },
  { label: 'agents', href: '/agents' },
  { label: 'transactions', href: '/transactions' },
  { label: 'alerts', href: '/alerts' },
  { label: 'settings', href: '/settings' },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-14 items-center px-5 pt-[env(safe-area-inset-top)]">
        <Link
          href="/overview"
          onClick={onNavigate}
          className="flex items-center gap-2.5 text-sm font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          <span
            aria-hidden
            style={{
              display: 'block',
              width: 8,
              height: 8,
              background: 'var(--phosphor)',
              boxShadow: '0 0 6px var(--phosphor)',
              animation: 'v2-pulse 2s ease-in-out infinite',
            }}
          />
          <span>
            chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4" style={{ fontFamily: 'var(--font-mono)' }}>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 text-[13px] transition-colors min-h-[40px]',
              )}
              style={{
                color: active ? 'var(--phosphor)' : 'var(--fg-dim)',
                letterSpacing: '0.04em',
                textDecoration: 'none',
              }}
            >
              <span style={{ color: active ? 'var(--phosphor)' : 'transparent' }}>›</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
        <Link
          href="/agents?register=true"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 px-3 py-3 text-[12px] transition-colors min-h-[44px]"
          style={{
            marginTop: 12,
            background: 'var(--phosphor)',
            color: 'var(--bg)',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textDecoration: 'none',
          }}
        >
          + register agent
        </Link>
      </div>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className="inline-flex items-center justify-center p-2 md:hidden min-h-[44px] min-w-[44px]"
      style={{ color: 'var(--fg-dim)' }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 md:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'absolute left-0 top-0 flex h-full w-64 flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--line)',
        }}
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}

export function MobileRegisterFab() {
  return (
    <Link
      href="/agents?register=true"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center md:hidden mb-[env(safe-area-inset-bottom)]"
      style={{
        background: 'var(--phosphor)',
        color: 'var(--bg)',
        boxShadow: '0 0 24px rgba(61,216,141,0.35)',
      }}
      aria-label="Register Agent"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside
      className="hidden md:flex h-screen w-56 flex-col"
      style={{
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--line)',
      }}
    >
      <SidebarContent />
    </aside>
  );
}

export function useMobileSidebar() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
