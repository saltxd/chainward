'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Overview', href: '/agents', icon: '◆' },
  { label: 'Agents', href: '/agents', icon: '⬡' },
  { label: 'Transactions', href: '/transactions', icon: '⇄' },
  { label: 'Alerts', href: '/alerts', icon: '⚡' },
  { label: 'Settings', href: '/settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center px-6">
        <Link href="/agents" className="text-lg font-bold">
          Agent<span className="text-primary">Guard</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              pathname === item.href
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="text-xs text-muted-foreground">AgentGuard v0.0.1</div>
      </div>
    </aside>
  );
}
