'use client';

import { useSession, signOut } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/overview': 'Overview',
  '/agents': 'Agents',
  '/transactions': 'Transactions',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const title = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? '';

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="flex items-center gap-4">
        {session?.user?.email && (
          <span className="text-sm text-muted-foreground">{session.user.email}</span>
        )}
        <button
          onClick={handleSignOut}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
