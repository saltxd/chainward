'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Overview', href: '/overview', icon: '◆' },
  { label: 'Agents', href: '/agents', icon: '⬡' },
  { label: 'Transactions', href: '/transactions', icon: '⇄' },
  { label: 'Alerts', href: '/alerts', icon: '⚡' },
  { label: 'Settings', href: '/settings', icon: '⚙' },
];

/* ------------------------------------------------------------------ */
/*  Shared sidebar content used by both desktop and mobile drawers    */
/* ------------------------------------------------------------------ */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-14 items-center px-6 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight" onClick={onNavigate}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chainward-logo.svg" alt="" className="h-6 w-6" />
          <span>Chain<span className="text-accent-foreground">Ward</span></span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-3 md:py-2 text-sm transition-colors min-h-[44px]',
              pathname.startsWith(item.href)
                ? 'border-l-2 border-accent-foreground text-accent-foreground bg-transparent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/agents?register=true"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 border border-dashed border-border px-3 py-3 md:py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground min-h-[44px]"
        >
          + Register Agent
        </Link>
      </div>

    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hamburger button — rendered by the dashboard layout on mobile     */
/* ------------------------------------------------------------------ */
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className="inline-flex items-center justify-center p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden min-h-[44px] min-w-[44px]"
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

/* ------------------------------------------------------------------ */
/*  Mobile slide-out drawer                                           */
/* ------------------------------------------------------------------ */
export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll when drawer is open
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
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={cn(
          'absolute left-0 top-0 flex h-full w-60 flex-col border-r border-border bg-card transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile floating "Register Agent" button                           */
/* ------------------------------------------------------------------ */
export function MobileRegisterFab() {
  return (
    <Link
      href="/agents?register=true"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:hidden mb-[env(safe-area-inset-bottom)]"
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

/* ------------------------------------------------------------------ */
/*  Desktop sidebar — unchanged layout, hidden on mobile              */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-60 flex-col border-r border-border bg-card">
      <SidebarContent />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook for dashboard layout to manage mobile drawer state           */
/* ------------------------------------------------------------------ */
export function useMobileSidebar() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
