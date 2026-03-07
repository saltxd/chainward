'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/docs', label: 'Getting Started' },
  { href: '/docs/api', label: 'API Reference' },
  { href: '/docs/alerts', label: 'Alert Types' },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#050508] pt-[env(safe-area-inset-top)] text-[#e4e4e7]">
      {/* Top bar */}
      <nav className="border-b border-[#1a1a2e] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-6 w-6" />
            ChainWard
          </Link>
          <span className="text-[#3f3f46]">/</span>
          <span className="text-sm text-[#a1a1aa]">Docs</span>
        </div>
      </nav>

      <div className="mx-auto flex flex-col md:max-w-6xl md:flex-row">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden w-56 shrink-0 border-r border-[#1a1a2e] p-6 md:block" style={{ height: 'calc(100dvh - 57px)' }}>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    pathname === item.href
                      ? 'bg-[#1B5E20]/20 font-medium text-[#4ade80]'
                      : 'text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Mobile nav */}
        <div className="flex gap-2 overflow-x-auto border-b border-[#1a1a2e] px-4 py-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[44px] shrink-0 items-center rounded-md px-4 py-2.5 text-sm ${
                pathname === item.href
                  ? 'bg-[#1B5E20]/20 font-medium text-[#4ade80]'
                  : 'text-[#a1a1aa]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-12 md:py-10">{children}</main>
      </div>
    </div>
  );
}
